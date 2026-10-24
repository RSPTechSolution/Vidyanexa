"use client";

import {
  Activity, ArrowRight, Building2, CalendarClock, CalendarDays, ClipboardCheck, Megaphone, Wallet, CheckCircle2, Circle, Clock, CreditCard, Inbox, LayoutGrid, PartyPopper,
  Settings2, UserPlus, Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/common/stat-card";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { CustomiseDashboard, DashboardSections } from "@/components/dashboard/customise";
import { UsageBar, formatBytes } from "@/components/common/usage-bar";
import { RolesDonut, RolesDonutSkeleton, SigninsChart } from "@/components/dashboard/lazy-charts";
import { DAY_NAMES, TodayList, formatTime } from "@/components/timetable/grid";
import { PercentBadge } from "@/components/attendance/status";
import { useCan, useSession } from "@/components/session-provider";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { Lead, TimetableView } from "@/lib/api/types";
import { describeAudit } from "@/lib/audit-labels";
import { formatDate, formatDateTime, greeting, inr, roleLabel, timeAgo } from "@/lib/format";
import { modulesReviewed } from "@/lib/local-flags";
import {
  useAttendanceOverview, useAttendanceSections, useAudit, useCurrentSchool, useDashboardSummary, useFeeSummary, useMyAttendance, useMyFees,
  useMyHomework, useMyTimetables, useNotices, useSchools, useUsers,
} from "@/lib/queries";
import { toast } from "sonner";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

function Hero({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) {
  const me = useSession();
  return (
    <div className="aurora dash-hero relative overflow-hidden rounded-2xl bg-panel p-6 text-white shadow-lg sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(217_226_255/0.25),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(0_25_68/0.3),transparent)]" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-white/75">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}, {me.full_name.split(" ")[0]}</h1>
          <p className="mt-1.5 text-white/80">{subtitle}</p>
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

const heroButton = "inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-3.5 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 outline-none focus-visible:ring-2 focus-visible:ring-white";

function WelcomeBanner() {
  const params = useSearchParams();
  if (params.get("welcome") !== "1") return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <PartyPopper className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">Your school is ready!</p>
        <p className="text-muted-foreground">Your free trial has started. Complete the steps below to set things up, and add your staff when you&apos;re ready.</p>
      </div>
    </div>
  );
}

function SetupChecklist() {
  const can = useCan();
  const school = useCurrentSchool();
  const users = useUsers({ page: 1, page_size: 1 }, can("users.view"));
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => setReviewed(modulesReviewed.get()), []);
  const steps = [
    { done: Boolean(school.data?.phone && school.data?.address), label: "Complete the school profile", detail: "Contact details appear on receipts and certificates.", href: "/settings/school", show: can("school.view") },
    { done: reviewed, label: "Choose the modules you need", detail: "Switch off anything you won't use to keep menus simple.", href: "/settings/modules", show: can("modules.manage") },
    { done: (users.data?.meta?.total ?? 0) > 1, label: "Add your staff", detail: "Create accounts for principals, teachers and office staff.", href: "/settings/users", show: can("users.view") },
  ].filter((s) => s.show);
  const done = steps.filter((s) => s.done).length;
  const complete = steps.length > 0 && done === steps.length;
  // The first time every step is done, celebrate once (remembered on this device).
  useEffect(() => {
    if (!complete) return;
    try {
      if (localStorage.getItem("vnx-setup-celebrated")) return;
      localStorage.setItem("vnx-setup-celebrated", "1");
    } catch { return; }
    celebrate();
    toast.success("Your school is set up", { description: "Everything on the checklist is done." });
  }, [complete]);
  if (!steps.length) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Set up your school</CardTitle>
          <span className="text-xs font-medium text-muted-foreground tabular">{done}/{steps.length} done</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {steps.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                {school.isLoading ? <Skeleton className="mt-0.5 size-5 rounded-full" />
                  : s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                  : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.detail}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function RecentActivity() {
  const audit = useAudit({ page: 1, page_size: 6 });
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest changes across your school</CardDescription>
        </div>
        <Link href="/settings/audit" className="text-sm font-medium text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        {audit.isLoading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : !audit.data?.data.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-border">
            {audit.data.data.map((e) => (
              <li key={e.id} className="relative flex items-start gap-3 pl-5">
                <span className="absolute top-1.5 left-0 size-[7px] rounded-full bg-primary ring-4 ring-card" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p><span className="font-medium">{e.user_name ?? "System"}</span> <span className="text-muted-foreground">{describeAudit(e.action, e.meta, e.entity_id).toLowerCase()}</span></p>
                  <time className="text-xs text-muted-foreground" dateTime={e.created_at} title={formatDateTime(e.created_at)}>{timeAgo(e.created_at)}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function SchoolDashboard() {
  const me = useSession();
  const can = useCan();
  const summary = useDashboardSummary();
  const s = summary.data;
  const trial = me.school?.subscription_status === "trialing";

  return (
    <div className="dash-cards space-y-6">
      <Hero subtitle={`${me.school?.name} · ${roleLabel(me.role)}`}>
        {can("users.manage") && <Link href="/settings/users" className={heroButton}><UserPlus className="size-4" aria-hidden />Add user</Link>}
        {can("school.manage") && <Link href="/settings/school" className={heroButton}><Settings2 className="size-4" aria-hidden />School profile</Link>}
        {can("billing.view") && <Link href="/settings/billing" className={heroButton}><CreditCard className="size-4" aria-hidden />{me.school?.plan.name} plan</Link>}
        <CustomiseDashboard layoutKey="school" className={heroButton} sections={SCHOOL_SECTIONS.filter((x) => x.id !== "activity" || can("audit.view"))} />
      </Hero>

      <Suspense><WelcomeBanner /></Suspense>

      {trial && (
        <Link href="/settings/billing" className="flex items-center gap-3 rounded-xl border border-info/30 bg-info/5 p-4 text-sm transition hover:border-info/50">
          <CalendarClock className="size-5 shrink-0 text-info" aria-hidden />
          {s ? (
            <span className="flex-1">
              <span className="font-semibold">{s.trial_days_left > 0 ? `${s.trial_days_left} days left in your free trial` : "Your free trial has ended"}</span>{" "}
              <span className="text-muted-foreground">You&apos;re trying the {s.plan.name} plan. Compare plans any time.</span>
            </span>
          ) : <Skeleton className="h-4 flex-1" />}
          <ArrowRight className="size-4 text-info" aria-hidden />
        </Link>
      )}

      <DashboardSections layoutKey="school" sections={[
        { id: "pulse", label: "Today at school", node: <SchoolPulse /> },
        { id: "stats", label: "Key numbers", node: (
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
        <StatCard label="Active accounts" value={s?.active_users ?? 0} loading={summary.isLoading} icon={Users} hint="Staff, parents and students" href={can("users.view") ? "/settings/users" : undefined} />
        </StaggerItem>
        <StaggerItem>
        <StatCard label="Sign-ins" value={s?.signins_total ?? 0} loading={summary.isLoading} icon={Activity} accent="info" hint="Last 14 days" />
        </StaggerItem>
        <StaggerItem>
        <StatCard label="Modules on" value={s ? `${s.modules_enabled} / ${s.modules_in_plan}` : "—"} loading={summary.isLoading} icon={LayoutGrid} accent="success" hint={`Included in ${s?.plan.name ?? "your"} plan`} href={can("modules.manage") ? "/settings/modules" : undefined} />
        </StaggerItem>
        <StaggerItem>
        <StatCard
            label="Staff seats"
            value={s ? (s.staff.limit === null ? `${s.staff.used}` : `${s.staff.used} / ${s.staff.limit}`) : "—"}
            loading={summary.isLoading}
            icon={CreditCard}
            accent={s && s.staff.limit !== null && s.staff.used / s.staff.limit >= 0.8 ? "warning" : "primary"}
            hint={s?.staff.limit === null ? "Unlimited on your plan" : "Used of your plan's limit"}
            href={can("billing.view") ? "/settings/billing" : undefined}
          />
        </StaggerItem>
      </Stagger>
        ) },
        { id: "signins", label: "Sign-in activity", span: 4, node: (
        <Card>
          <CardHeader>
            <CardTitle>Sign-in activity</CardTitle>
            <CardDescription>How many times people signed in each day</CardDescription>
          </CardHeader>
          <CardContent>{s ? <SigninsChart data={s.signins} /> : <Skeleton className="h-64 w-full" />}</CardContent>
        </Card>
        ) },
        { id: "people", label: "People at your school", span: 2, node: (
        <Card>
          <CardHeader>
            <CardTitle>People at your school</CardTitle>
            <CardDescription>Every enrolled student, and staff and parents with accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? <RolesDonut data={s.roles} /> : <RolesDonutSkeleton rows={6} />}
            {s && <p className="mt-4 text-xs text-muted-foreground">{s.student_logins} of the students also have their own app login; the rest are followed by their parents.</p>}
          </CardContent>
        </Card>
        ) },
        { id: "setup", label: "Set up your school", span: 2, node: <SetupChecklist /> },
        { id: "notices", label: "Notices", span: 2, node: <LatestNotices /> },
        ...(can("audit.view") ? [{ id: "activity", label: "Recent activity", span: 2 as const, node: <RecentActivity /> }] : []),
        { id: "plan", label: "Plan usage", span: 2, node: (
          <>
        {(s || summary.isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle>Plan usage</CardTitle>
              <CardDescription>{s ? `${s.plan.name} plan` : <Skeleton className="mt-1 h-4 w-24" />}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {s ? (
                <>
                  <UsageBar label="Students" used={s.students.used} limit={s.students.limit} />
                  <UsageBar label="Staff accounts" used={s.staff.used} limit={s.staff.limit} />
                  <UsageBar label="Storage" used={s.storage.used} limit={s.storage.limit} format={formatBytes} href={can("school.manage") ? "/settings/storage" : undefined}
                    hint={s.storage.used >= (s.storage.limit ?? Infinity) ? "Storage is full: new uploads are paused. Remove old files or upgrade." : "Storage is nearly full. Remove old files or upgrade before it fills up."} />
                </>
              ) : [0, 1, 2].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-2 w-full rounded-full" /></div>)}
              {can("billing.view") && (
                <Link href="/settings/billing" className={buttonVariants({ variant: "outline", className: "w-full" })}>Compare plans</Link>
              )}
            </CardContent>
          </Card>
        )}
          </>
        ) },
      ]} />
    </div>
  );
}

const SCHOOL_SECTIONS = [
  { id: "pulse", label: "Today at school" }, { id: "stats", label: "Key numbers" }, { id: "signins", label: "Sign-in activity" },
  { id: "people", label: "People at your school" }, { id: "setup", label: "Set up your school" }, { id: "notices", label: "Notices" },
  { id: "activity", label: "Recent activity" }, { id: "plan", label: "Plan usage" },
];

const PERSONAL_ROLES = ["teacher", "parent", "student"];

function ListRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-y" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 py-2.5">
          <Skeleton className="mt-0.5 size-4 rounded" />
          <span className="flex-1"><Skeleton className="my-[3px] h-3.5 w-3/4" /><Skeleton className="my-0.5 h-3 w-1/3" /></span>
        </li>
      ))}
    </ul>
  );
}

function nextLesson(view: TimetableView, day: number) {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const mins = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
  return view.periods
    .filter((p) => !p.is_break && mins(p.end_time) > m)
    .map((p) => ({ p, e: view.entries.find((e) => e.day === day && e.period_id === p.id) }))
    .find((x) => x.e);
}

/** The newest notices for this user, unread first. */
function LatestNotices() {
  const me = useSession();
  const notices = useNotices(1, false, me.modules.includes("communication"));
  if (!me.modules.includes("communication")) return null;
  const list = (notices.data?.data ?? []).slice(0, 4);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div><CardTitle>Notices</CardTitle><CardDescription>From the school</CardDescription></div>
        <Link href="/notices" className="text-sm font-medium text-primary hover:underline">All notices</Link>
      </CardHeader>
      <CardContent>
        {notices.isLoading ? <ListRowsSkeleton rows={4} /> : list.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No notices yet.</p> : (
          <ul className="divide-y">
            {list.map((n) => (
              <li key={n.id}>
                <Link href="/notices" className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                  <Megaphone className={cn("mt-0.5 size-4 shrink-0", n.priority === "urgent" ? "text-destructive" : n.priority === "important" ? "text-warning" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", !n.read ? "font-semibold" : "text-muted-foreground")}>{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{n.author ?? "School"} · {timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Parents and students: homework still to do. */
function HomeworkDue() {
  const me = useSession();
  const hw = useMyHomework(me.modules.includes("academics"));
  const todo = (hw.data ?? []).filter((h) => h.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  if (!me.modules.includes("academics") || hw.isError) return null;
  if (!hw.data) {
    return (
      <Card>
        <CardHeader><CardTitle>Homework to do</CardTitle><Skeleton className="mt-1 h-4 w-28" /></CardHeader>
        <CardContent><ListRowsSkeleton rows={4} /></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div><CardTitle>Homework to do</CardTitle><CardDescription>{todo.length ? `${(hw.data ?? []).filter((h) => h.status === "pending").length} not done yet` : "All caught up"}</CardDescription></div>
        <Link href="/my-homework" className="text-sm font-medium text-primary hover:underline">All homework</Link>
      </CardHeader>
      <CardContent>
        {todo.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing pending. 🎉</p> : (
          <ul className="space-y-2">
            {todo.map((h) => (
              <li key={h.id + h.student_id} className="flex items-start gap-3 text-sm">
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", h.overdue ? "bg-destructive" : "bg-primary")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.subject_name}: {h.title}</span>
                  <span className={cn("block text-xs", h.overdue ? "text-destructive" : "text-muted-foreground")}>{h.overdue ? "Overdue" : `Due ${formatDate(h.due_date, "EEE d MMM")}`}{hw.data && new Set(hw.data.map((x) => x.student_id)).size > 1 ? ` · ${h.student_name.split(" ")[0]}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Parents and students: this month's attendance and what's owed, per child. */
function FamilySummary() {
  const me = useSession();
  const month = new Date().toISOString().slice(0, 7);
  const attendance = useMyAttendance(month, me.modules.includes("attendance"));
  const fees = useMyFees(me.modules.includes("fees"));
  const kids = attendance.data ?? [];
  if (attendance.isLoading || fees.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {[0, 1].map((i) => (
          <Card key={i} className={cn(i === 1 && "hidden md:flex")}>
            <CardContent>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-1 h-4 w-20" />
              <div className="mt-3 flex gap-2"><Skeleton className="h-[34px] w-36 rounded-lg" /><Skeleton className="h-[34px] w-28 rounded-lg" /></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (!kids.length && !fees.data?.children.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(kids.length ? kids : fees.data!.children.map((c) => ({ student_id: c.student_id, name: c.name, class_section: c.class_section, month_percent: null }))).map((k) => {
        const f = fees.data?.children.find((c) => c.student_id === k.student_id);
        return (
          <Card key={k.student_id} className="card-lift">
            <CardContent className="flex items-center gap-5">
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold">{k.name}</p>
                <p className="text-xs text-muted-foreground">{k.class_section}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/my-attendance" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:border-primary/40">
                    <ClipboardCheck className="size-4 text-primary" aria-hidden />Attendance <PercentBadge value={k.month_percent} />
                  </Link>
                  {f && (
                    <Link href="/my-fees" className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:border-primary/40", f.overdue > 0 && "border-destructive/40")}>
                      <Wallet className="size-4 text-primary" aria-hidden />
                      {f.due > 0 ? <><span className="font-semibold tabular">{inr(f.due)}</span> due{f.overdue > 0 && <span className="text-xs font-semibold text-destructive">· overdue</span>}</> : <span className="text-success">Fees paid</span>}
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Teachers: which of their classes still need attendance today. */
function AttendanceToTake() {
  const can = useCan();
  const sections = useAttendanceSections(undefined, can("attendance.mark"));
  const list = sections.data?.filter((s) => s.is_class_teacher || s.marked < s.students) ?? [];
  if (!can("attendance.mark") || sections.isError) return null;
  if (!sections.data) {
    return (
      <Card>
        <CardHeader><CardTitle>Attendance today</CardTitle><Skeleton className="mt-1 h-4 w-48" /></CardHeader>
        <CardContent><div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-[62px] rounded-lg" /></div></CardContent>
      </Card>
    );
  }
  if (!sections.data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance today</CardTitle>
          <CardDescription>Only the class teacher (incharge) of a class takes its daily attendance. You aren&apos;t a class teacher yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const pending = sections.data.filter((s) => s.marked < s.students);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Attendance today</CardTitle>
          <CardDescription>{pending.length ? `${pending.length} of your classes still to mark` : "All your classes are marked"}</CardDescription>
        </div>
        <Link href="/attendance" className="text-sm font-medium text-primary hover:underline">All classes</Link>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.slice(0, 6).map((s) => {
            const done = s.students > 0 && s.marked >= s.students;
            return (
              <li key={s.section_id}>
                <Link href={`/attendance/${s.section_id}`} className={cn("card-lift flex items-center gap-3 rounded-lg border p-3", !done && "border-primary/40 bg-primary/[0.03]")}>
                  {done ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <ClipboardCheck className="size-5 text-primary" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.label}{s.is_class_teacher && <span className="ml-1.5 text-xs font-normal text-muted-foreground">your class</span>}</span>
                    <span className="block text-xs text-muted-foreground">{done ? `${s.present} present · ${s.absent} absent` : `${s.students} students · tap to mark`}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Admin tiles for attendance and fees, shown only with the permissions and modules. */
function SchoolPulse() {
  const can = useCan();
  const me = useSession();
  const att = useAttendanceOverview(undefined, can("attendance.view") && me.modules.includes("attendance"));
  const fees = useFeeSummary(can("fees.view") && me.modules.includes("fees"));
  const showAtt = can("attendance.view") && me.modules.includes("attendance") && !att.isError;
  const showFees = can("fees.view") && me.modules.includes("fees") && !fees.isError;
  if (!showAtt && !showFees) return null;
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Each tile keeps its place: a placeholder until its numbers arrive, then the tile, so nothing moves. */}
      {showAtt && (
        <>
          <StaggerItem>{att.data
            ? <StatCard label="Present today" value={att.data.percent !== null ? `${att.data.percent}%` : "Not marked"} icon={ClipboardCheck} accent="success" hint={`${att.data.sections_marked} of ${att.data.sections_total} classes marked`} href="/attendance" />
            : <StatCard label="Present today" value="" loading icon={ClipboardCheck} accent="success" />}</StaggerItem>
          <StaggerItem>{att.data
            ? <StatCard label="Absent today" value={att.data.counts.absent} icon={Users} accent="warning" hint={`${att.data.low_attendance.length} below 75% this month`} href="/attendance" />
            : <StatCard label="Absent today" value="" loading icon={Users} accent="warning" />}</StaggerItem>
        </>
      )}
      {showFees && (
        <>
          <StaggerItem>{fees.data
            ? <StatCard label="Fees collected today" value={inr(fees.data.collected_today)} icon={Wallet} accent="info" hint={`${inr(fees.data.collected_month)} this month`} href="/fees" />
            : <StatCard label="Fees collected today" value="" loading icon={Wallet} accent="info" />}</StaggerItem>
          <StaggerItem>{fees.data
            ? <StatCard label="Fees overdue" value={inr(fees.data.overdue)} icon={CalendarClock} accent="warning" hint={`${fees.data.overdue_invoices} invoices`} href="/fees?tab=invoices&status=overdue" />
            : <StatCard label="Fees overdue" value="" loading icon={CalendarClock} accent="warning" />}</StaggerItem>
        </>
      )}
    </Stagger>
  );
}

function PersonalDashboard() {
  const me = useSession();
  const views = useMyTimetables();
  const [day, setDay] = useState(0);
  useEffect(() => setDay(new Date().getDay()), []);
  const teacher = me.role === "teacher";
  const all = views.data ?? [];
  const first = all[0];
  const todayCount = all.reduce((n, v) => n + v.entries.filter((e) => e.day === day).length, 0);
  const next = first ? nextLesson(first, day) : undefined;
  const sections = new Set(first?.entries.map((e) => e.section_id)).size;
  const subjects = new Set(first?.entries.map((e) => e.subject_id)).size;

  return (
    <div className="dash-cards space-y-6">
      <Hero subtitle={`${me.school?.name} · ${roleLabel(me.role)}`}>
        <Link href="/my-timetable" className={heroButton}><CalendarDays className="size-4" aria-hidden />{me.role === "parent" ? "Children's timetable" : "My timetable"}</Link>
        <Link href="/account" className={heroButton}><Settings2 className="size-4" aria-hidden />My account</Link>
        <CustomiseDashboard layoutKey={me.role} className={heroButton} sections={[
          { id: "stats", label: "Key numbers" }, { id: "focus", label: teacher ? "Attendance to take" : "Your children" }, { id: "notices", label: "Notices" },
          ...(!teacher ? [{ id: "homework", label: "Homework to do" }] : []), { id: "timetable", label: "Today's timetable" },
        ]} />
      </Hero>

      <DashboardSections layoutKey={me.role} sections={[
        { id: "stats", label: "Key numbers", node: (
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label={teacher ? "Lessons today" : "Periods today"} value={todayCount} loading={views.isLoading} icon={CalendarDays} href="/my-timetable" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Next up" value={next ? next.e!.subject_name : "Done for today"} loading={views.isLoading} icon={Clock} accent="info"
            hint={next ? `${next.p.name} · ${formatTime(next.p.start_time)}${teacher ? ` · ${next.e!.section_label}` : next.e!.teacher_name ? ` · ${next.e!.teacher_name}` : ""}` : undefined} />
        </StaggerItem>
        <StaggerItem>
          {teacher
            ? <StatCard label="This week" value={first?.entries.length ?? 0} loading={views.isLoading} icon={Activity} accent="success" hint={`Across ${sections} sections`} />
            : <StatCard label={me.role === "parent" ? "Children" : "Subjects"} value={me.role === "parent" ? all.length : subjects} loading={views.isLoading} icon={Users} accent="success" />}
        </StaggerItem>
        <StaggerItem>
          {teacher
            ? <StatCard label="Subjects taught" value={subjects} loading={views.isLoading} icon={LayoutGrid} accent="warning" />
            : <StatCard label="Teachers" value={new Set(all.flatMap((v) => v.entries.map((e) => e.teacher_id).filter(Boolean))).size} loading={views.isLoading} icon={LayoutGrid} accent="warning" hint="Teaching your week" />}
        </StaggerItem>
      </Stagger>
        ) },
        { id: "focus", label: teacher ? "Attendance to take" : "Your children", node: teacher ? <AttendanceToTake /> : <FamilySummary /> },
        { id: "notices", label: "Notices", span: teacher ? 6 : 3, node: <LatestNotices /> },
        ...(!teacher ? [{ id: "homework", label: "Homework to do", span: 3 as const, node: <HomeworkDue /> }] : []),
        { id: "timetable", label: "Today's timetable", node: (
      views.isLoading ? <Skeleton className="h-72 rounded-xl" /> : !all.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {me.role === "parent" ? "No children are linked to your account yet. Please contact the school office." : "Nothing is scheduled for you yet."}
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {all.map((v) => (
            <Card key={v.owner_id + v.title}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>{teacher ? "Today's classes" : me.role === "parent" ? v.title : "Today"}</CardTitle>
                  <CardDescription>{me.role === "parent" ? v.subtitle : day >= 1 && day <= 6 ? DAY_NAMES[day - 1] : "Sunday"}</CardDescription>
                </div>
                <Link href="/my-timetable" className="text-sm font-medium text-primary hover:underline">Week</Link>
              </CardHeader>
              <CardContent><TodayList view={v} day={day} /></CardContent>
            </Card>
          ))}
        </div>
      )
        ) },
      ]} />
    </div>
  );
}

function PlatformDashboard() {
  const all = useSchools({ page: 1, page_size: 1 });
  const active = useSchools({ page: 1, page_size: 1, is_active: true });
  const leads = useQuery({ queryKey: ["platform", "leads", "new"], queryFn: () => api<Lead[]>("/platform/leads", { query: { status: "new", page_size: 5 } }) });
  const newest = all.data?.data[0];
  return (
    <div className="dash-cards space-y-6">
      <Hero subtitle="Platform overview">
        <Link href="/platform/schools" className={heroButton}><Building2 className="size-4" aria-hidden />Schools</Link>
        <Link href="/platform/leads" className={heroButton}><Inbox className="size-4" aria-hidden />Leads</Link>
      </Hero>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Schools" value={all.data?.meta?.total ?? 0} loading={all.isLoading} icon={Building2} href="/platform/schools" />
        <StatCard label="Active schools" value={active.data?.meta?.total ?? 0} loading={active.isLoading} icon={CheckCircle2} accent="success"
          hint={all.data && active.data ? `${all.data.meta!.total - active.data.meta!.total} suspended` : undefined} />
        <StatCard label="New leads" value={leads.data?.meta?.total ?? 0} loading={leads.isLoading} icon={Inbox} accent="warning" href="/platform/leads" hint="Waiting for a reply" />
        <StatCard label="Newest school" value={newest?.name ?? "—"} loading={all.isLoading} icon={Clock} accent="info" hint={newest ? `Added ${timeAgo(newest.created_at)}` : undefined} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div><CardTitle>Latest enquiries</CardTitle><CardDescription>From the website and schools asking to upgrade</CardDescription></div>
          <Link href="/platform/leads" className="text-sm font-medium text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {!leads.data?.data.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No new enquiries.</p>
          ) : (
            <ul className="divide-y">
              {leads.data.data.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="flex-1"><span className="font-medium">{l.name}</span> <span className="text-muted-foreground">· {l.school_name ?? l.email}</span></span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{l.kind}</span>
                  <time className="w-24 text-right text-xs text-muted-foreground" dateTime={l.created_at}>{timeAgo(l.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const me = useSession();
  if (me.role === "super_admin") return <PlatformDashboard />;
  return PERSONAL_ROLES.includes(me.role) ? <PersonalDashboard /> : <SchoolDashboard />;
}
