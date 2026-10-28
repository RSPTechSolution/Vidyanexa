"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowLeft, BadgeCheck, BookOpen, Briefcase, CalendarClock, ChevronRight, GraduationCap, IdCard, KeyRound, Mail, Pencil, Phone, Power,
  ShieldCheck, UserX,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import { PercentBadge } from "@/components/attendance/status";
import { PersonSections, StudentOverviewCards } from "@/components/profile/sections";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { useCan, useSession } from "@/components/session-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SetPasswordDialog, UserFormDialog } from "@/components/users/user-dialogs";
import { ApiError, api } from "@/lib/api/client";
import type { LinkedChild, User, UserDetail } from "@/lib/api/types";
import { describeAudit } from "@/lib/audit-labels";
import { formatDate, formatDateTime, inr, initials, roleLabel, timeAgo, firstName } from "@/lib/format";
import { useUserDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Info({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate font-medium">{value}</div>
      </div>
    </div>
  );
}

/** A child (or the student themself) with this month's attendance and what's unpaid; opens the student's profile. */
function ChildRow({ c, self = false }: { c: LinkedChild; self?: boolean }) {
  return (
    <li>
      <Link href={`/students/${c.student_id}`} className="card-lift flex items-center gap-3 rounded-xl border p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(c.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.class_section}{c.admission_no ? ` · ${c.admission_no}` : ""}{self ? "" : <> · <span className="capitalize">{c.relationship}</span></>}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {c.attendance_percent !== null && <PercentBadge value={c.attendance_percent} />}
          {c.fee_due !== null && (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular",
              c.fee_due <= 0 ? "bg-success/12 text-success" : c.fee_overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
              {c.fee_due <= 0 ? "Fees paid" : `${inr(c.fee_due)} ${c.fee_overdue ? "overdue" : "due"}`}
            </span>
          )}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function asUser(u: UserDetail): User {
  return { ...u, must_change_password: u.must_change_password ?? false, last_login_at: u.last_login_at ?? null } as unknown as User;
}

function UserPage({ id }: { id: string }) {
  const me = useSession();
  const can = useCan();
  const manage = can("users.manage") && id !== me.id;
  const qc = useQueryClient();
  const q = useUserDetail(id);
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const toggle = useMutation({
    mutationFn: (active: boolean) => api(`/users/${id}`, { method: "PATCH", body: { is_active: active } }),
    onSuccess: (_d, active) => {
      qc.invalidateQueries({ queryKey: ["user", id] });
      qc.invalidateQueries({ queryKey: ["users"] });
      setToggling(false);
      toast.success(active ? "Account reactivated" : "Account deactivated");
    },
    onError: (e) => { setToggling(false); toast.error(e instanceof ApiError ? e.message : "Could not update"); },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
      </div>
    );
  }
  if (!q.data) return <EmptyState title="User not found" description="They may have been removed, or belong to another school." />;
  const u = q.data;
  const status = !u.is_active ? <StatusBadge status="inactive" /> : u.must_change_password ? <StatusBadge tone="warning" label="Password pending" /> : <StatusBadge status="active" />;
  const staff = u.role !== "parent" && u.role !== "student";

  return (
    <>
      <Link href="/settings/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Users</Link>

      <div className="aurora relative overflow-hidden rounded-2xl bg-panel p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-white/15 font-heading text-3xl font-semibold ring-2 ring-white/30">{initials(u.full_name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{u.full_name}</h1>
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/25">{roleLabel(u.role)}</span>
            </div>
            <p className="mt-1 truncate text-white/80">{u.email}</p>
            {(u.designation || u.employee_id) && <p className="mt-0.5 text-sm text-white/70">{[u.designation, u.employee_id].filter(Boolean).join(" · ")}</p>}
          </div>
          {manage && (
            <div className="flex flex-wrap gap-2 self-start">
              {[
                { label: "Edit", icon: Pencil, onClick: () => setEditing(true) },
                { label: "Reset password", icon: KeyRound, onClick: () => setResetting(true) },
                { label: u.is_active ? "Deactivate" : "Reactivate", icon: u.is_active ? UserX : Power, onClick: () => setToggling(true) },
              ].map((b) => (
                <button key={b.label} type="button" onClick={b.onClick}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-3.5 text-sm font-medium ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 active:scale-[0.97]">
                  <b.icon className="size-4" aria-hidden />{b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info icon={Mail} label="Email (sign-in)" value={<a href={`mailto:${u.email}`} className="hover:underline">{u.email}</a>} />
            <Info icon={Phone} label="Phone" value={u.phone ? <a href={`tel:${u.phone}`} className="hover:underline">{u.phone}</a> : "Not recorded"} />
            <Info icon={ShieldCheck} label="Status" value={status} />
            <Info icon={CalendarClock} label="Last sign-in" value={u.last_login_at ? <span title={formatDateTime(u.last_login_at)}>{timeAgo(u.last_login_at)}</span> : "Never"} />
            {u.created_at && <Info icon={BadgeCheck} label="Account created" value={formatDate(u.created_at)} />}
            {u.employee_id && <Info icon={IdCard} label="Employee ID" value={<span className="font-mono">{u.employee_id}</span>} />}
            {u.designation && <Info icon={Briefcase} label="Designation" value={u.designation} />}
            {u.license_no && <Info icon={IdCard} label="Driving licence" value={<span className="font-mono">{u.license_no}</span>} />}
          </CardContent>
        </Card>

        {u.role === "parent" && (
          <Card>
            <CardHeader>
              <CardTitle>Children</CardTitle>
              <CardDescription>What this parent sees in the app. Attendance is for this month.</CardDescription>
            </CardHeader>
            <CardContent>
              {u.children.length === 0 ? <p className="text-sm text-muted-foreground">No children linked. Link them from the student&apos;s profile.</p> : (
                <ul className="space-y-3">{u.children.map((c) => <ChildRow key={c.student_id} c={c} />)}</ul>
              )}
            </CardContent>
          </Card>
        )}

        {u.role === "student" && (
          <Card>
            <CardHeader><CardTitle>Student record</CardTitle><CardDescription>Attendance is for this month.</CardDescription></CardHeader>
            <CardContent>
              {u.student ? <ul><ChildRow c={u.student} self /></ul> : <p className="text-sm text-muted-foreground">This login isn&apos;t linked to a student record.</p>}
            </CardContent>
          </Card>
        )}

        {staff && (
          <Card>
            <CardHeader><CardTitle>Classes</CardTitle><CardDescription>From the class settings and the timetable.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium"><GraduationCap className="size-4 text-primary" aria-hidden />Class teacher (incharge) of</p>
                {u.class_teacher_of.length === 0 ? <p className="text-sm text-muted-foreground">No class.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {u.class_teacher_of.map((s) => <Link key={s.section_id} href={`/attendance/${s.section_id}`} className="rounded-full border bg-primary/[0.06] px-3 py-1 text-sm hover:border-primary/40">{s.label} <span className="text-muted-foreground">· {s.students} students</span></Link>)}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4 text-primary" aria-hidden />Teaches</p>
                {u.teaching.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in the timetable.</p> : (
                  <ul className="flex flex-wrap gap-2">{u.teaching.map((t) => <li key={t} className="rounded-full border px-3 py-1 text-sm">{t}</li>)}</ul>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Everything else connected to them: work and pay, books, bus duty, teaching, visitors, their children's requests. */}
      <div className="mt-6"><PersonSections p={u} /></div>
      {u.student_overview && u.student_id && <div className="mt-6"><StudentOverviewCards o={u.student_overview} studentId={u.student_id} /></div>}

      {can("audit.view") && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start justify-between">
            <div><CardTitle className="flex items-center gap-2"><Activity className="size-4" aria-hidden />Recent activity</CardTitle><CardDescription>Sign-ins and changes made by {firstName(u.full_name)}</CardDescription></div>
            <Link href="/settings/audit" className="text-sm font-medium text-primary hover:underline">Audit log</Link>
          </CardHeader>
          <CardContent>
            {u.activity.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p> : (
              <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-border">
                {u.activity.map((a, i) => (
                  <li key={i} className="relative pl-5 text-sm">
                    <span className="absolute top-1.5 left-0 size-[7px] rounded-full bg-primary ring-4 ring-card" aria-hidden />
                    <p>{describeAudit(a.action, a.meta, a.entity_id)}</p>
                    <time className="text-xs text-muted-foreground" dateTime={a.created_at} title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {manage && (
        <>
          <UserFormDialog open={editing} onOpenChange={(o) => { setEditing(o); if (!o) qc.invalidateQueries({ queryKey: ["user", id] }); }} user={asUser(u)} />
          <SetPasswordDialog open={resetting} onOpenChange={setResetting} user={asUser(u)} />
          <ConfirmDialog
            open={toggling}
            onOpenChange={setToggling}
            pending={toggle.isPending}
            destructive={u.is_active}
            title={u.is_active ? "Deactivate this account?" : "Reactivate this account?"}
            description={u.is_active ? `${u.full_name} will be signed out everywhere and can't sign in until reactivated.` : `${u.full_name} will be able to sign in again.`}
            confirmLabel={u.is_active ? "Deactivate" : "Reactivate"}
            onConfirm={() => toggle.mutate(!u.is_active)}
          />
        </>
      )}
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PermissionGate permission="users.view">
      <UserPage id={id} />
    </PermissionGate>
  );
}
