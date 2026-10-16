"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isPast, isToday, parseISO } from "date-fns";
import { BookOpenCheck, CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { LoadMore, useLoadMore } from "@/components/common/load-more";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { ClassesIllustration } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { colorOf } from "@/components/timetable/grid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import type { HomeworkItem } from "@/lib/api/types";
import { useHomeworkList, useHomeworkTargets } from "@/lib/queries";
import { cn } from "@/lib/utils";

function SetHomeworkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const targets = useHomeworkTargets(open);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && targets.data?.length && !sectionId) { setSectionId(targets.data[0].section_id); setSubjectId(targets.data[0].subjects[0]?.id ?? ""); }
    if (open) setError(null);
  }, [open, targets.data, sectionId]);
  const target = targets.data?.find((t) => t.section_id === sectionId);
  const save = useMutation({
    mutationFn: () => api("/homework", { method: "POST", body: { section_id: sectionId, subject_id: subjectId, title, details: details || null, due_date: due } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homework"] }); onOpenChange(false); setTitle(""); setDetails(""); toast.success(`Homework set for ${target?.section_label}`, { description: "Parents and students see it in the app." }); },
    onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not save"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Set homework</DialogTitle><DialogDescription>For the classes and subjects you teach.</DialogDescription></DialogHeader>
        {targets.data?.length === 0 ? <p className="text-sm text-muted-foreground">You don&apos;t teach any classes yet.</p> : (
          <form id="hw-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Class" required>
              {(a) => (
                <Select value={sectionId || undefined} onValueChange={(v) => { const t = targets.data?.find((x) => x.section_id === v); setSectionId(String(v)); setSubjectId(t?.subjects[0]?.id ?? ""); }}>
                  <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Class">{target?.section_label}</SelectValue></SelectTrigger>
                  <SelectContent className="max-h-72">{targets.data?.map((t) => <SelectItem key={t.section_id} value={t.section_id}>{t.section_label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Due" required>{(a) => <Input {...a} type="date" value={due} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDue(e.target.value)} />}</Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Subject</legend>
              <div className="flex flex-wrap gap-1.5">
                {target?.subjects.map((s) => (
                  <button key={s.id} type="button" aria-pressed={subjectId === s.id} onClick={() => setSubjectId(s.id)}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition", subjectId === s.id ? colorOf(s.color).cell : "text-muted-foreground hover:bg-muted")}>
                    <span className={cn("size-2 rounded-full", colorOf(s.color).dot)} />{s.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Task" required className="sm:col-span-2">{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exercise 4.2, questions 1–10" maxLength={200} />}</Field>
            <Field label="Details" className="sm:col-span-2">{(a) => <Textarea {...a} value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={3000} placeholder="Optional" />}</Field>
          </form>
        )}
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="hw-form" disabled={!sectionId || !subjectId || title.trim().length < 3} loading={save.isPending} loadingText="Saving…">Set homework</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HomeworkCard({ h }: { h: HomeworkItem }) {
  const due = parseISO(h.due_date);
  const past = isPast(due) && !isToday(due);
  const reviewed = h.students ? Math.round((100 * h.checked) / h.students) : 0;
  return (
    <Link href={`/homework/${h.id}`} className="card-lift flex h-full flex-col rounded-xl border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3">
        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", colorOf(h.subject_color).cell)}>{h.subject_name}</span>
        <span className="ml-auto text-xs font-medium text-muted-foreground">{h.section_label}</span>
      </div>
      <p className="mt-2 line-clamp-2 font-medium">{h.title}</p>
      <p className={cn("mt-1 flex items-center gap-1 text-xs", past ? "text-muted-foreground" : "text-primary")}>
        <CalendarClock className="size-3.5" aria-hidden />{isToday(due) ? "Due today" : `Due ${format(due, "EEE d MMM")}`}
      </p>
      <div className="mt-auto pt-3">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{h.done} done at home · {h.checked} checked</span><span className="tabular">{h.students} students</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-success" style={{ width: `${reviewed}%` }} /></div>
      </div>
    </Link>
  );
}

export default function HomeworkPage() {
  const targets = useHomeworkTargets();
  const [sectionId, setSectionId] = useState("all");
  const [page, setPage] = useState(1);
  const q = useHomeworkList(page, sectionId === "all" ? undefined : sectionId);
  const [setting, setSetting] = useState(false);
  const more = useLoadMore(q.data?.data, q.data?.meta, (h) => h.id);
  const groups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const items = more.rows;
    return [["Upcoming", items.filter((h) => h.due_date >= today)], ["Past", items.filter((h) => h.due_date < today)]] as const;
  }, [more.rows]);
  return (
    <PermissionGate permission="homework.manage">
      <PageHeader title="Homework" description="Set homework for your classes and check who has done it."
        actions={<Button onClick={() => setSetting(true)}><Plus aria-hidden />Set homework</Button>} />
      <Select value={sectionId} onValueChange={(v) => { setSectionId(String(v)); setPage(1); }}>
        <SelectTrigger className="mb-4 h-9 w-56" aria-label="Class"><SelectValue>{sectionId === "all" ? "All my classes" : targets.data?.find((t) => t.section_id === sectionId)?.section_label}</SelectValue></SelectTrigger>
        <SelectContent className="max-h-72"><SelectItem value="all">All my classes</SelectItem>{targets.data?.map((t) => <SelectItem key={t.section_id} value={t.section_id}>{t.section_label}</SelectItem>)}</SelectContent>
      </Select>
      {q.isLoading && !more.rows.length ? <Skeleton className="h-64 rounded-xl" /> : !more.rows.length ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<ClassesIllustration />} title="No homework yet" action={<Button onClick={() => setSetting(true)}><BookOpenCheck aria-hidden />Set homework</Button>} />
      ) : groups.map(([label, items]) => items.length > 0 && (
        <section key={label} className="mb-6">
          <h2 className="mb-3 font-heading text-lg font-bold">{label}</h2>
          <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((h) => <StaggerItem key={h.id}><HomeworkCard h={h} /></StaggerItem>)}</Stagger>
        </section>
      ))}
      <LoadMore shown={more.rows.length} total={more.total} hasMore={more.hasMore} loading={q.isFetching && page === more.nextPage} fetching={q.isFetching} onLoadMore={() => setPage(more.nextPage)} noun="homework" />
      <SetHomeworkDialog open={setting} onOpenChange={setSetting} />
    </PermissionGate>
  );
}
