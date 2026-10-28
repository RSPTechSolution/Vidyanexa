"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, parseISO } from "date-fns";
import { ArrowLeft, MessageSquarePlus, MessagesSquare, Search, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { ChatContact, Conversation } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { useChatContacts, useChatMessages, useConversations } from "@/lib/queries";
import { cn } from "@/lib/utils";

const when = (iso: string) => (isToday(parseISO(iso)) ? format(parseISO(iso), "h:mm a") : format(parseISO(iso), "d MMM"));

function NewChat({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (o: boolean) => void; onStarted: (c: Conversation) => void }) {
  const contacts = useChatContacts(open);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ChatContact | null>(null);
  const [body, setBody] = useState("");
  useEffect(() => { if (open) { setPicked(null); setBody(""); setSearch(""); } }, [open]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (contacts.data ?? []).filter((c) => !q || `${c.name} ${c.student_name} ${c.role}`.toLowerCase().includes(q)).slice(0, 80);
  }, [contacts.data, search]);
  const start = useMutation({
    mutationFn: () => api<Conversation>("/chat/conversations", { method: "POST", body: { student_id: picked!.student_id, user_id: picked!.user_id, body } }),
    onSuccess: ({ data }) => { onOpenChange(false); onStarted(data); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New message</DialogTitle><DialogDescription>Write to a teacher or a parent about a student.</DialogDescription></DialogHeader>
        {!picked ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or student" className="pl-9" aria-label="Search people" />
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border" aria-label="People">
              {contacts.isLoading && <li className="p-3 text-sm text-muted-foreground">Loading…</li>}
              {contacts.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">There is nobody to message yet.</li>}
              {!!contacts.data?.length && list.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">No one matches “{search.trim()}”. A student shows here once they or a parent have an app login (add one from the student&apos;s page).</li>
              )}
              {list.map((c) => (
                <li key={`${c.student_id}-${c.user_id}`}>
                  <button type="button" onClick={() => setPicked(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(c.name)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{c.role} · {c.student_name}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">To <span className="font-semibold">{picked.name}</span> ({picked.role}) about {picked.student_name} · <button type="button" className="text-primary underline" onClick={() => setPicked(null)}>change</button></p>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" maxLength={2000} autoFocus />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!picked || !body.trim()} onClick={() => start.mutate()} loading={start.isPending}><Send aria-hidden />Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Thread({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useChatMessages(conv.id);
  const [body, setBody] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [q.data?.length]);
  useEffect(() => { if (q.data) qc.invalidateQueries({ queryKey: ["chat", "conversations"] }); }, [q.data, qc]);
  const send = useMutation({
    mutationFn: () => api(`/chat/conversations/${conv.id}/messages`, { method: "POST", body: { body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["chat"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send"),
  });
  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to conversations" onClick={onBack}><ArrowLeft aria-hidden /></Button>
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(conv.other_name)}</span>
        <div className="min-w-0"><p className="truncate font-semibold">{conv.other_name}</p><p className="truncate text-xs text-muted-foreground">{conv.other_role} · about {conv.student_name}</p></div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite" aria-label="Messages">
        {q.isLoading ? <Skeleton className="h-20" /> : q.data?.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", m.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={cn("mt-0.5 text-right text-[10px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{when(m.created_at)}{m.mine && m.read ? " · read" : ""}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
        <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" aria-label="Write a message" maxLength={2000}
          className="min-h-10 resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (body.trim()) send.mutate(); } }} />
        <Button type="submit" disabled={!body.trim()} loading={send.isPending} aria-label="Send"><Send aria-hidden /></Button>
      </form>
    </div>
  );
}

function MessagesPage() {
  const router = useRouter();
  const current = useSearchParams().get("c");
  const q = useConversations();
  const [creating, setCreating] = useState(false);
  const conv = q.data?.find((c) => c.id === current);
  const open = (id: string | null) => router.replace(id ? `/messages?c=${id}` : "/messages", { scroll: false });
  return (
    <>
      <PageHeader title="Messages" description="Private messages between families and teachers."
        actions={<Button onClick={() => setCreating(true)}><MessageSquarePlus aria-hidden />New message</Button>} />
      {q.isLoading ? <Skeleton className="h-96 rounded-2xl" /> : !q.data?.length ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<MessagesSquare className="size-12 text-muted-foreground/60" aria-hidden />}
          title="No messages yet" action={<Button onClick={() => setCreating(true)}><MessageSquarePlus aria-hidden />New message</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <ul className={cn("divide-y rounded-2xl border bg-card", conv && "hidden lg:block")} aria-label="Conversations">
            {q.data.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => open(c.id)} aria-current={c.id === current}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40", c.id === current && "bg-primary/5")}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(c.other_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.other_name}</span>
                      {c.last_message_at && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{when(c.last_message_at)}</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.student_name} · {c.last_message}</span>
                  </span>
                  {c.unread > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
          {conv ? <Thread key={conv.id} conv={conv} onBack={() => open(null)} /> : <EmptyState className="hidden rounded-2xl border bg-card lg:flex" title="Choose a conversation" />}
        </div>
      )}
      <NewChat open={creating} onOpenChange={setCreating} onStarted={(c) => { q.refetch(); open(c.id); }} />
    </>
  );
}

export default function Page() {
  return <Suspense><MessagesPage /></Suspense>;
}
