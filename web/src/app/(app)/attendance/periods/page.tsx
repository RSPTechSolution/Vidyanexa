"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ClipboardList, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { useCan } from "@/components/session-provider";
import { colorOf } from "@/components/timetable/grid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import { useBunks, useMyPeriods, usePeriodRoster } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Roster({ entryId, date }: { entryId: string; date: string }) {
  const qc = useQueryClient();
  const q = usePeriodRoster(entryId, date);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  useEffect(() => { if (q.data) setAbsent(new Set(q.data.students.filter((s) => s.absent).map((s) => s.student_id))); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api(`/attendance/periods/${entryId}`, { method: "PUT", body: { date, absent_ids: [...absent] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["periods"] }); toast.success(`Saved: ${absent.size} missing from this period`); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });
  if (q.isLoading || !q.data) return <Skeleton className="h-72 rounded-xl" />;
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <h2 className="font-semibold">{q.data.label}</h2>
        {q.data.marked && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Taken</span>}
        <span className="ml-auto text-sm text-muted-foreground">{q.data.students.length - absent.size} here · {absent.size} missing</span>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        {/* Only promise the morning's absentees when the morning roll call has actually been taken. */}
        Tick who is missing.{" "}
        {q.data.students.some((s) => s.day_status) ? "Students absent at the morning roll call are ticked already." : "The morning roll call isn't taken yet."}
      </p>
      <ul className="grid gap-1 p-3 sm:grid-cols-2">
        {q.data.students.map((s) => {
          const off = absent.has(s.student_id);
          return (
            <li key={s.student_id}>
              <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2", off ? "border-destructive/40 bg-destructive/5" : "hover:bg-muted/40")}>
                <Checkbox checked={off} onCheckedChange={(c) => setAbsent((x) => { const n = new Set(x); if (c) n.add(s.student_id); else n.delete(s.student_id); return n; })} />
                <span className="w-7 text-xs text-muted-foreground tabular">{s.roll_no ?? "–"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                {s.day_status && s.day_status !== "present" && <span className="text-xs text-muted-foreground capitalize">{s.day_status.replace("_", " ")}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end border-t p-3"><Button onClick={() => save.mutate()} loading={save.isPending} loadingText="Saving…"><Check aria-hidden />{q.data.marked ? "Update" : "Save"}</Button></div>
    </div>
  );
}

function Bunks({ date }: { date: string }) {
  const q = useBunks(date);
  return (
    <section className="mt-8" aria-label="Missed periods">
      <h2 className="mb-1 font-heading text-lg font-bold">Present but missed periods</h2>
      <p className="mb-3 text-sm text-muted-foreground">Students marked present in the morning who were missing from one or more periods.</p>
      {q.isLoading ? <Skeleton className="h-24" /> : !q.data?.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No one missed a period.</p> : (
        <ul className="divide-y rounded-xl border bg-card">
          {q.data.map((b) => (
            <li key={b.student_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <UserX className="size-4 text-warning" aria-hidden /><span className="font-medium">{b.name}</span>
              <span className="text-muted-foreground">{b.section_label}</span>
              <span className="ml-auto text-xs">{b.periods.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PeriodsPage() {
  const can = useCan();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const periods = useMyPeriods(date, can("attendance.mark"));
  const [entryId, setEntryId] = useState<string | null>(null);
  useEffect(() => { setEntryId(null); }, [date]);
  return (
    <>
      <PageHeader title="Period attendance" description="The class teacher (incharge) checks who is in each period of their class, to catch students who skip lessons." />
      <input type="date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => e.target.value && setDate(e.target.value)}
             aria-label="Date" className="mb-5 h-9 rounded-md border bg-background px-3 text-sm" />
      {/* The empty state's height: what office staff, who teach no periods, end up seeing. */}
      {periods.isLoading ? <Skeleton className="h-[230px] rounded-2xl" /> : !periods.data?.length ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<ClipboardList className="size-12 text-muted-foreground/60" aria-hidden />}
          title="No periods to take" description="Only the class teacher (incharge) takes period attendance, for the periods of their own class." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <ul className="space-y-2" aria-label="Your periods">
            {periods.data.map((p) => (
              <li key={p.entry_id}>
                <button type="button" onClick={() => setEntryId(p.entry_id)} aria-pressed={entryId === p.entry_id}
                  className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", entryId === p.entry_id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40")}>
                  <span className="w-14 text-xs text-muted-foreground tabular">{p.start_time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.section_label}{p.cover && <span className="ml-1 text-xs text-warning">(cover)</span>}</span>
                    <span className={cn("mt-0.5 inline-block rounded border px-1.5 text-[11px] font-semibold", colorOf(p.subject_color).cell)}>{p.subject_name}</span>
                  </span>
                  {/* Green only when everyone was there: students missing is something to look at, not good news. */}
                  {!p.marked ? <span className="text-xs text-muted-foreground">Not taken</span>
                    : p.absent === 0 ? <span className="text-xs font-semibold text-success">All here</span>
                    : <span className="text-xs font-semibold text-warning">{p.absent} out</span>}
                </button>
              </li>
            ))}
          </ul>
          {entryId ? <Roster entryId={entryId} date={date} /> : <EmptyState className="rounded-2xl border bg-card" title="Choose a period" />}
        </div>
      )}
      {can("attendance.manage") && <Bunks date={date} />}
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="attendance.mark"><PeriodsPage /></PermissionGate>;
}
