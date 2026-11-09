"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, UserMinus, UserRoundCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { colorOf } from "@/components/timetable/grid";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import type { AvailableTeacher, Substitution } from "@/lib/api/types";
import { useSubstitutionDay, useTimetableTeachers } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);

function SubstitutePicker({ s }: { s: Substitution }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const cands = useQuery({
    queryKey: ["substitutions", "candidates", s.id],
    enabled: open,
    queryFn: async () => (await api<AvailableTeacher[]>(`/substitutions/${s.id}/candidates`)).data,
  });
  const assign = useMutation({
    mutationFn: (id: string | null) => api(`/substitutions/${s.id}`, { method: "PUT", body: { substitute_id: id } }),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ["substitutions"] }); toast.success(id ? "Cover assigned. They've been notified." : "Cover removed"); },
    onError: (e) => toast.error(errText(e, "Could not assign")),
  });
  return (
    <Select open={open} onOpenChange={setOpen} value={s.substitute_id ?? "none"} onValueChange={(v) => assign.mutate(v === "none" ? null : String(v))}>
      <SelectTrigger className={cn("h-9 w-full sm:w-60", !s.substitute_id && "border-warning/60 text-warning")} aria-label={`Cover for ${s.section_label} ${s.period_name}`}>
        <SelectValue>{s.substitute ?? "Choose a teacher"}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="none">No cover yet</SelectItem>
        {cands.isLoading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Finding free teachers…</p>}
        {cands.data?.map((c) => (
          <SelectItem key={c.id} value={c.id} disabled={c.status === "busy"}>
            <span className="flex w-full items-center gap-2">
              <span className={cn("size-2 rounded-full", c.status === "free" ? "bg-success" : c.status === "busy" ? "bg-destructive" : "bg-warning")} aria-hidden />
              {c.full_name}
              <span className="ml-auto text-xs text-muted-foreground">
                {c.status === "busy" ? `Busy · ${c.busy_with}` : c.status === "unavailable" ? "Prefers not" : `${c.periods_that_day} periods${c.qualified ? " · teaches it" : ""}`}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SubstitutionsPage() {
  const qc = useQueryClient();
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const q = useSubstitutionDay(day);
  const teachers = useTimetableTeachers();
  const [teacherId, setTeacherId] = useState("");
  const markAbsent = useMutation({
    mutationFn: (id: string) => api("/substitutions/absent", { method: "POST", body: { date: day, teacher_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["substitutions"] }); setTeacherId(""); toast.success("Marked away. Now choose a cover for each period."); },
    onError: (e) => toast.error(errText(e, "Could not mark the teacher away")),
  });
  const present = useMutation({
    mutationFn: (id: string) => api("/substitutions/present", { method: "POST", body: { date: day, teacher_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["substitutions"] }); toast.success("Back on the timetable; covers removed"); },
  });
  const d = q.data;
  const away = new Set(d?.absent_teachers.map((t) => t.id));
  const dayDate = parseISO(day);
  return (
    <PermissionGate permission="substitutions.manage">
      <PageHeader title="Substitutions" description="When a teacher is away, give each of their periods to someone who's free." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDay(format(addDays(dayDate, -1), "yyyy-MM-dd"))}><ChevronLeft aria-hidden /></Button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Date"
                 className="h-9 rounded-md border bg-background px-3 text-sm" />
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDay(format(addDays(dayDate, 1), "yyyy-MM-dd"))}><ChevronRight aria-hidden /></Button>
          <span className="text-sm font-medium">{format(dayDate, "EEEE")}</span>
        </div>
        <div className="flex w-full items-end gap-2 sm:ml-auto sm:w-auto">
          <Field label="Teacher away" className="min-w-0 flex-1 sm:w-60 sm:flex-none">
            {(a) => (
              <Select value={teacherId || undefined} onValueChange={(v) => setTeacherId(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Choose a teacher">{teachers.data?.find((t) => t.id === teacherId)?.full_name}</SelectValue></SelectTrigger>
                <SelectContent className="max-h-72">{teachers.data?.filter((t) => !away.has(t.id)).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Button disabled={!teacherId} loading={markAbsent.isPending} onClick={() => markAbsent.mutate(teacherId)}><UserMinus aria-hidden />Mark away</Button>
        </div>
      </div>
      {q.isLoading ? <Skeleton className="h-64 rounded-xl" /> : !d?.absent_teachers.length ? (
        <EmptyState className="rounded-2xl border bg-card" title="Everyone is in" description={`No teacher is marked away on ${format(dayDate, "EEEE d MMMM")}.`} />
      ) : (
        <div className="space-y-5">
          {d.absent_teachers.map((t) => {
            const periods = d.periods.filter((p) => p.absent_teacher_id === t.id);
            const all = t.covered === t.periods;
            return (
              <section key={t.id} className="rounded-2xl border bg-card" aria-label={`${t.full_name}'s periods`}>
                <div className="flex flex-wrap items-center gap-3 border-b p-4">
                  <Users className="size-5 text-muted-foreground" aria-hidden />
                  <h2 className="font-semibold">{t.full_name}</h2>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", all ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                    {all ? <><CheckCircle2 className="mr-1 inline size-3.5" aria-hidden />All {t.periods} covered</> : `${t.covered} of ${t.periods} covered`}
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto" loading={present.isPending} onClick={() => present.mutate(t.id)}><UserRoundCheck aria-hidden />Not away</Button>
                </div>
                <ul className="divide-y">
                  {periods.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                      <div className="w-28 shrink-0"><p className="font-semibold">{p.period_name}</p><p className="text-xs text-muted-foreground tabular">{p.start_time}–{p.end_time}</p></div>
                      <div className="min-w-0 flex-1">
                        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", colorOf(p.subject_color).cell)}>{p.subject_name}</span>
                        <span className="ml-2 text-sm">{p.section_label}</span>
                      </div>
                      <SubstitutePicker s={p} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PermissionGate>
  );
}
