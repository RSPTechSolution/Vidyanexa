"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, Inbox, Link2, Phone, Plus, Search, TrendingUp, UserPlus, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { LoadMore, useLoadMore } from "@/components/common/load-more";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatCard } from "@/components/common/stat-card";
import { useSession } from "@/components/session-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { Enquiry, EnquiryStatus } from "@/lib/api/types";
import { formatDate, timeAgo } from "@/lib/format";
import { useClasses, useEnquiries, useEnquirySummary } from "@/lib/queries";
import { cn } from "@/lib/utils";

const STATUS: Record<EnquiryStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-info/10 text-info" },
  contacted: { label: "Contacted", tone: "bg-primary/10 text-primary" },
  visit: { label: "Visit booked", tone: "bg-warning/10 text-warning" },
  applied: { label: "Applied", tone: "bg-primary/15 text-primary" },
  admitted: { label: "Admitted", tone: "bg-success/10 text-success" },
  lost: { label: "Not joining", tone: "bg-muted text-muted-foreground" },
};
const SOURCES: Record<string, string> = { walk_in: "Walk-in", phone: "Phone call", website: "Website", referral: "Referral", other: "Other" };
const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);

function StatusPill({ status }: { status: EnquiryStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS[status].tone)}>{STATUS[status].label}</span>;
}

function NewEnquiryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const classes = useClasses(open);
  const blank = { student_name: "", date_of_birth: "", class_id: "", parent_name: "", phone: "", email: "", previous_school: "", source: "walk_in", follow_up_on: "", note: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(blank); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => api("/admissions", { method: "POST", body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v])) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enquiries"] }); toast.success(`Enquiry for ${f.student_name} saved`); onOpenChange(false); },
    onError: (e) => setError(errText(e, "Could not save")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>New admission enquiry</DialogTitle><DialogDescription>A family asking about a seat. Add a follow-up date so nobody is forgotten.</DialogDescription></DialogHeader>
        <form id="enq-form" className="grid max-h-[62vh] gap-4 overflow-y-auto px-0.5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Child's name" required>{(a) => <Input {...a} value={f.student_name} onChange={set("student_name")} maxLength={200} />}</Field>
          <Field label="Class wanted">
            {(a) => (
              <Select value={f.class_id || undefined} onValueChange={(v) => setF((x) => ({ ...x, class_id: String(v) }))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Choose">{classes.data?.find((c) => c.id === f.class_id)?.name}</SelectValue></SelectTrigger>
                <SelectContent className="max-h-72">{classes.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Parent's name" required>{(a) => <Input {...a} value={f.parent_name} onChange={set("parent_name")} maxLength={200} />}</Field>
          <Field label="Phone" required>{(a) => <Input {...a} type="tel" value={f.phone} onChange={set("phone")} maxLength={20} />}</Field>
          <Field label="Email">{(a) => <Input {...a} type="email" value={f.email} onChange={set("email")} />}</Field>
          <Field label="Date of birth">{(a) => <Input {...a} type="date" value={f.date_of_birth} onChange={set("date_of_birth")} />}</Field>
          <Field label="How they heard of us">
            {(a) => (
              <Select value={f.source} onValueChange={(v) => setF((x) => ({ ...x, source: String(v) }))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{SOURCES[f.source]}</SelectValue></SelectTrigger>
                <SelectContent>{Object.entries(SOURCES).filter(([k]) => k !== "website").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Follow up on">{(a) => <Input {...a} type="date" value={f.follow_up_on} onChange={set("follow_up_on")} />}</Field>
          <Field label="Previous school" className="sm:col-span-2">{(a) => <Input {...a} value={f.previous_school} onChange={set("previous_school")} maxLength={100} />}</Field>
          <Field label="Notes" className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} value={f.note} onChange={set("note")} placeholder="e.g. Needs transport from Sector 21" />}</Field>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="enq-form" disabled={!f.student_name.trim() || !f.parent_name.trim() || f.phone.trim().length < 6} loading={save.isPending} loadingText="Saving…">Save enquiry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnquirySheet({ enquiry, onOpenChange }: { enquiry: Enquiry | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [current, setCurrent] = useState<Enquiry | null>(enquiry);
  useEffect(() => { setCurrent(enquiry); setNote(""); }, [enquiry]);
  const done = (e: Enquiry) => { setCurrent(e); qc.invalidateQueries({ queryKey: ["enquiries"] }); };
  const patch = useMutation({
    mutationFn: (body: object) => api<Enquiry>(`/admissions/${current!.id}`, { method: "PATCH", body }),
    onSuccess: ({ data }) => { done(data); toast.success("Saved"); },
    onError: (e) => toast.error(errText(e, "Could not save")),
  });
  const addNote = useMutation({
    mutationFn: () => api<Enquiry>(`/admissions/${current!.id}/notes`, { method: "POST", body: { text: note } }),
    onSuccess: ({ data }) => { done(data); setNote(""); },
    onError: (e) => toast.error(errText(e, "Could not add the note")),
  });
  const e = current;
  return (
    <Sheet open={Boolean(enquiry)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {e && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">{e.student_name} <StatusPill status={e.status} /></SheetTitle>
              <SheetDescription>{e.class_name ? `For ${e.class_name} · ` : ""}{SOURCES[e.source]} · {timeAgo(e.created_at)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Parent</dt><dd className="font-medium">{e.parent_name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Phone</dt><dd><a className="font-medium text-primary hover:underline" href={`tel:${e.phone}`}>{e.phone}</a></dd></div>
                {e.email && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-medium">{e.email}</dd></div>}
                {e.date_of_birth && <div><dt className="text-xs text-muted-foreground">Date of birth</dt><dd className="font-medium">{formatDate(e.date_of_birth)}</dd></div>}
                {e.previous_school && <div><dt className="text-xs text-muted-foreground">Previous school</dt><dd className="font-medium">{e.previous_school}</dd></div>}
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Stage">
                  {(a) => (
                    <Select value={e.status} onValueChange={(v) => patch.mutate({ status: v })} disabled={e.status === "admitted"}>
                      <SelectTrigger id={a.id} className="w-full"><SelectValue>{STATUS[e.status].label}</SelectValue></SelectTrigger>
                      <SelectContent>{(Object.keys(STATUS) as EnquiryStatus[]).filter((s) => s !== "admitted").map((s) => <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Follow up on">
                  {(a) => <Input {...a} type="date" value={e.follow_up_on ?? ""} disabled={e.status === "admitted" || e.status === "lost"}
                                 onChange={(ev) => patch.mutate({ follow_up_on: ev.target.value || null })} />}
                </Field>
              </div>
              {e.status !== "admitted" && e.status !== "lost" && (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/students/new?enquiry=${e.id}`} className={buttonVariants()}><UserPlus aria-hidden />Admit as a student</Link>
                  <Button variant="outline" onClick={() => patch.mutate({ status: "lost" })}><XCircle aria-hidden />Not joining</Button>
                </div>
              )}
              {e.student_id && <Link href={`/students/${e.student_id}`} className={buttonVariants({ variant: "outline" })}><CheckCircle2 aria-hidden />Open student profile</Link>}
              <section aria-label="Notes">
                <h3 className="mb-2 font-semibold">Notes</h3>
                <form className="mb-3 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (note.trim()) addNote.mutate(); }}>
                  <Input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Called, visiting on Saturday" aria-label="New note" maxLength={1000} />
                  <Button type="submit" disabled={!note.trim()} loading={addNote.isPending}>Add</Button>
                </form>
                {e.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
                  <ol className="space-y-3 border-l pl-4">
                    {e.notes.map((n, i) => (
                      <li key={i} className="relative">
                        <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary ring-4 ring-background" aria-hidden />
                        <p className="text-sm">{n.text}</p>
                        <p className="text-xs text-muted-foreground">{n.by} · {timeAgo(n.at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const FILTERS = [["open", "Open"], ["due", "Follow up today"], ["new", "New"], ["visit", "Visit booked"], ["applied", "Applied"], ["admitted", "Admitted"], ["lost", "Not joining"], ["", "All"]] as const;

export default function AdmissionsPage() {
  const me = useSession();
  const formUrl = typeof window === "undefined" ? "" : `${window.location.origin}/apply/${me.school?.slug ?? ""}`;
  const [filter, setFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const summary = useEnquirySummary();
  const q = useEnquiries({ page, status: filter === "due" ? undefined : filter || undefined, due: filter === "due" || undefined, search: search.trim() || undefined });
  const more = useLoadMore(q.data?.data, q.data?.meta, (e) => e.id);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Enquiry | null>(null);
  const s = summary.data;
  return (
    <PermissionGate permission="admissions.manage">
      <PageHeader title="Admissions" description="Enquiries from walk-ins, calls and your website, through to admission."
        actions={<>
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(formUrl); toast.success("Form link copied", { description: `${formUrl} — add it to your website or share it on WhatsApp.` }); }}>
            <Link2 aria-hidden />Copy form link
          </Button>
          <Button onClick={() => setCreating(true)}><Plus aria-hidden />New enquiry</Button>
        </>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open enquiries" value={s ? s.by_status.new + s.by_status.contacted + s.by_status.visit + s.by_status.applied : "—"} icon={Inbox} loading={summary.isLoading} hint={s ? `${s.this_month} this month` : undefined} />
        <StatCard label="Follow up today" value={s?.due_today ?? "—"} icon={CalendarClock} accent="warning" loading={summary.isLoading}
          hint={s?.overdue ? <span className="text-destructive">{s.overdue} overdue</span> : "None overdue"} />
        <StatCard label="Admitted this month" value={s?.admitted_this_month ?? "—"} icon={UserPlus} accent="success" loading={summary.isLoading} />
        <StatCard label="Conversion" value={s?.conversion != null ? `${s.conversion}%` : "—"} icon={TrendingUp} accent="info" loading={summary.isLoading} hint="Admitted out of closed enquiries" />
      </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setPage(1); }}
              className={cn("rounded-full border px-3 py-1 text-sm transition", filter === v ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or phone" className="h-9 pl-9" aria-label="Search enquiries" />
        </div>
      </div>
      {q.isLoading && !more.rows.length ? <Skeleton className="h-72 rounded-xl" /> : !more.rows.length ? (
        <EmptyState className="rounded-2xl border bg-card" title="No enquiries here" description="Add walk-ins and phone calls, or share your website's admission form." action={<Button onClick={() => setCreating(true)}><Plus aria-hidden />New enquiry</Button>} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <ul role="list" aria-label="Enquiries" className="divide-y">
            {more.rows.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(e)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">{e.student_name}<StatusPill status={e.status} /></span>
                    <span className="block text-xs text-muted-foreground">{e.parent_name} · <Phone className="inline size-3" aria-hidden /> {e.phone}{e.class_name ? ` · ${e.class_name}` : ""}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{SOURCES[e.source]}</span>
                  <span className={cn("w-32 text-right text-xs", e.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {e.follow_up_on ? `${e.overdue ? "Overdue · " : "Follow up "}${format(parseISO(e.follow_up_on), "d MMM")}` : timeAgo(e.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <LoadMore shown={more.rows.length} total={more.total} hasMore={more.hasMore} loading={q.isFetching && page === more.nextPage} fetching={q.isFetching} onLoadMore={() => setPage(more.nextPage)} noun="enquiries" />
      <NewEnquiryDialog open={creating} onOpenChange={setCreating} />
      <EnquirySheet enquiry={open} onOpenChange={(o) => !o && setOpen(null)} />
    </PermissionGate>
  );
}
