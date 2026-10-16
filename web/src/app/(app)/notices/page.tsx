"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { AlertTriangle, BellRing, CheckCheck, Megaphone, Pencil, Pin, Plus, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "@/components/motion/motion";
import { LoadMore, useLoadMore } from "@/components/common/load-more";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { FamilyIllustration } from "@/components/illustrations";
import { useCan } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { Notice } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useNoticeSections, useNotices } from "@/lib/queries";
import { patchLists } from "@/lib/optimistic";
import { cn } from "@/lib/utils";

const PRIORITY = {
  normal: { label: "Notice", cls: "bg-muted text-muted-foreground", icon: Megaphone },
  important: { label: "Important", cls: "bg-warning/12 text-warning", icon: BellRing },
  urgent: { label: "Urgent", cls: "bg-destructive/10 text-destructive", icon: AlertTriangle },
} as const;

function ComposeDialog({ open, onOpenChange, notice }: { open: boolean; onOpenChange: (o: boolean) => void; notice: Notice | null }) {
  const can = useCan();
  const manage = can("notices.manage");
  const qc = useQueryClient();
  const sections = useNoticeSections(open);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Notice["audience"]>("sections");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState<Notice["priority"]>("normal");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(notice?.title ?? ""); setBody(notice?.body ?? ""); setAudience(notice?.audience ?? (manage ? "everyone" : "sections"));
    setPicked(new Set(notice?.section_ids ?? [])); setPriority(notice?.priority ?? "normal"); setPinned(notice?.pinned ?? false); setError(null);
  }, [open, notice, manage]);
  const save = useMutation({
    mutationFn: () => api(notice ? `/notices/${notice.id}` : "/notices", {
      method: notice ? "PUT" : "POST",
      body: { title, body, audience, section_ids: audience === "sections" ? [...picked] : [], priority, pinned },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notices"] }); onOpenChange(false); toast.success(notice ? "Notice updated" : "Notice posted"); },
    onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not post"),
  });
  const audiences = manage ? [["everyone", "Everyone"], ["families", "Parents & students"], ["staff", "Staff"], ["sections", "Chosen classes"]] as const : [["sections", "My classes"]] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{notice ? "Edit notice" : "New notice"}</DialogTitle><DialogDescription>It appears in the web app and the mobile apps straight away.</DialogDescription></DialogHeader>
        <form id="notice-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Title" required>{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
          <Field label="Message" required>{(a) => <Textarea {...a} value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} />}</Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Who should see it</legend>
            <div className="flex flex-wrap gap-2">
              {audiences.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={audience === k} onClick={() => setAudience(k)}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm transition", audience === k ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>{l}</button>
              ))}
            </div>
          </fieldset>
          {audience === "sections" && (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2" role="group" aria-label="Classes">
              {sections.data?.length === 0 && <p className="text-sm text-muted-foreground">You don&apos;t teach any classes yet.</p>}
              {sections.data?.map((s) => {
                const on = picked.has(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setPicked((p) => { const n = new Set(p); if (on) n.delete(s.id); else n.add(s.id); return n; })}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs transition", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{s.label}</button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Priority">
              {(Object.keys(PRIORITY) as Notice["priority"][]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", priority === p ? PRIORITY[p].cls + " ring-2 ring-current/30" : "text-muted-foreground hover:bg-muted")}>{PRIORITY[p].label}</button>
              ))}
            </div>
            {manage && <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={pinned} onCheckedChange={setPinned} />Pin to top</label>}
          </div>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="notice-form" disabled={title.trim().length < 3 || !body.trim() || (audience === "sections" && !picked.size)} loading={save.isPending} loadingText="Posting…">
            <Megaphone aria-hidden />{notice ? "Save" : "Post notice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoticeCard({ n, onEdit, onDelete }: { n: Notice; onEdit: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const read = useMutation({
    mutationFn: () => api(`/notices/${n.id}/read`, { method: "POST" }),
    // The unread dot goes at once; it comes back only if the server says no.
    onMutate: () => patchLists<Notice>(qc, ["notices"], (x) => x.id === n.id, { read: true }),
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["notices"] }); },
  });
  const P = PRIORITY[n.priority];
  const toggle = () => { setOpen((o) => !o); if (!n.read && !read.isPending) read.mutate(); };
  return (
    <motion.li layout className={cn("overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md", !n.read && "border-primary/40", n.priority === "urgent" && "border-destructive/40")}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-4 p-4 text-left outline-none focus-visible:bg-muted/40">
        <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl", P.cls)}><P.icon className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {!n.read && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
            <span className={cn("font-semibold", !n.read && "text-foreground")}>{n.title}</span>
            {n.pinned && <Pin className="size-3.5 text-primary" aria-label="Pinned" />}
            {n.priority !== "normal" && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", P.cls)}>{P.label}</span>}
          </span>
          <span className={cn("mt-1 block text-sm text-muted-foreground", !open && "line-clamp-1")}>{n.body}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{n.author ?? "School office"}</span>
            <time dateTime={n.created_at} title={formatDateTime(n.created_at)}>{formatDistanceToNowStrict(parseISO(n.created_at), { addSuffix: true })}</time>
            <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden />{n.audience_label}</span>
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && n.can_edit && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-4 py-2.5">
              {n.recipients !== null && (
                <span className="flex items-center gap-2 text-xs">
                  <CheckCheck className="size-4 text-success" aria-hidden />
                  Read by <span className="font-semibold tabular">{n.reads}</span> of <span className="tabular">{n.recipients}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-success" style={{ width: `${n.recipients ? Math.min(100, (100 * (n.reads ?? 0)) / n.recipients) : 0}%` }} />
                  </span>
                </span>
              )}
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={onEdit}><Pencil aria-hidden />Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 aria-hidden />Remove</Button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function NoticesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const q = useNotices(page, unread);
  const [compose, setCompose] = useState<{ open: boolean; notice: Notice | null }>({ open: false, notice: null });
  const [removing, setRemoving] = useState<Notice | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api(`/notices/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notices"] }); setRemoving(null); toast.success("Notice removed"); },
    onError: (e) => { setRemoving(null); toast.error(e instanceof ApiError ? e.message : "Could not remove"); },
  });
  const more = useLoadMore(q.data?.data, q.data?.meta, (n) => n.id);
  const list = more.rows;
  const readAll = useMutation({
    mutationFn: async () => { for (const n of list.filter((x) => !x.read)) await api(`/notices/${n.id}/read`, { method: "POST" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
  return (
    <>
      <PageHeader title="Notices" description="Announcements from the school."
        actions={<>
          {list.some((n) => !n.read) && <Button variant="outline" onClick={() => readAll.mutate()} loading={readAll.isPending} loadingText="Marking…"><CheckCheck aria-hidden />Mark all read</Button>}
          {can("notices.post") && <Button onClick={() => setCompose({ open: true, notice: null })}><Plus aria-hidden />New notice</Button>}
        </>} />
      <div role="tablist" aria-label="Show" className="mb-4 inline-flex rounded-lg border p-0.5 text-sm">
        {([[false, "All"], [true, "Unread"]] as const).map(([v, l]) => (
          <button key={l} role="tab" type="button" aria-selected={unread === v} onClick={() => { setUnread(v); setPage(1); }}
            className={cn("rounded-md px-3 py-1.5 font-medium", unread === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {q.isLoading && !list.length ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div> : list.length === 0 ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<FamilyIllustration />} title={unread ? "You're all caught up" : "No notices yet"} description={unread ? "Nothing new since you last looked." : undefined} />
      ) : (
        <ul className="space-y-3">
          {list.map((n) => <NoticeCard key={n.id} n={n} onEdit={() => setCompose({ open: true, notice: n })} onDelete={() => setRemoving(n)} />)}
        </ul>
      )}
      <LoadMore shown={list.length} total={more.total} hasMore={more.hasMore} loading={q.isFetching && page === more.nextPage} fetching={q.isFetching} onLoadMore={() => setPage(more.nextPage)} noun="notices" />
      <ComposeDialog open={compose.open} notice={compose.notice} onOpenChange={(o) => setCompose((c) => ({ ...c, open: o }))} />
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} destructive pending={del.isPending}
        title={`Remove "${removing?.title}"?`} description="It disappears for everyone." confirmLabel="Remove" onConfirm={() => removing && del.mutate(removing.id)} />
    </>
  );
}
