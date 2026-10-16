"use client";

import { AlertTriangle, CalendarCheck, Copy, Download, GraduationCap, Plus, Search, Upload, UserRound, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Suspense, useMemo, useState } from "react";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ImportDialog, exportCsv } from "@/components/common/import-dialog";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { StudentsIllustration } from "@/components/illustrations";
import { useCan } from "@/components/session-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Student } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { usePage } from "@/components/common/load-more";
import { useDebounced } from "@/lib/hooks";
import { useClasses, useStudents } from "@/lib/queries";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { all: "Any status", active: "Active", inactive: "Inactive", alumni: "Alumni" };
function QuickAction({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={href} aria-label={label} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} />}>
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const GENDER_TINT: Record<string, string> = {
  female: "bg-[oklch(0.93_0.05_340)] text-[oklch(0.45_0.15_340)] dark:bg-[oklch(0.35_0.08_340)] dark:text-[oklch(0.9_0.05_340)]",
  male: "bg-primary/10 text-primary",
  other: "bg-success/10 text-success",
};

function StudentsPage() {
  const can = useCan();
  const manage = can("students.manage");
  const canFees = can("fees.view");
  const canAttendance = can("attendance.mark");
  const router = useRouter();
  const params = useSearchParams();
  const classes = useClasses();

  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState(params.get("class_id") ?? "all");
  const [sectionId, setSectionId] = useState("all");
  const [status, setStatus] = useState("active");
  const [importing, setImporting] = useState(false);
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(q);

  const students = useStudents({
    page, search: q || undefined, class_id: classId === "all" ? undefined : classId,
    section_id: sectionId === "all" ? undefined : sectionId, status: status === "all" ? undefined : status,
  });
  const selectedClass = classes.data?.find((c) => c.id === classId);

  const columns = useMemo<Col<Student>[]>(() => [
    {
      id: "student",
      header: "Student",
      cell: ({ row: { original: s } }) => (
        <Link href={`/students/${s.id}`} className="group flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar><AvatarFallback className={cn("text-xs font-semibold", GENDER_TINT[s.gender])}>{initials(`${s.first_name} ${s.last_name}`)}</AvatarFallback></Avatar>
          <span className="min-w-0">
            <span className="block truncate font-medium group-hover:text-primary group-hover:underline">{s.first_name} {s.last_name}</span>
            <span className="block font-mono text-xs text-muted-foreground">{s.admission_no}</span>
          </span>
        </Link>
      ),
    },
    { id: "class", header: "Class", cell: ({ row: { original: s } }) => <span className="whitespace-nowrap">{s.class_name} – {s.section_name}</span> },
    { id: "roll", header: "Roll no.", cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.roll_no ?? "—"}</span> },
    {
      id: "parents",
      header: "Parents",
      cell: ({ row: { original: s } }) =>
        s.guardian_count ? (
          <span className="text-muted-foreground">{s.guardian_count} linked</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="size-3.5" aria-hidden />None linked</span>
        ),
    },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions",
      header: () => <span className="sr-only">Quick actions</span>,
      // Shown on hover or keyboard focus on larger screens, always on touch screens.
      cell: ({ row: { original: s } }) => (
        <div className="flex justify-end gap-0.5 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100">
          <QuickAction href={`/students/${s.id}`} label={`Open ${s.first_name}'s profile`} icon={UserRound} />
          {canFees && <QuickAction href={`/fees?tab=invoices&q=${encodeURIComponent(s.admission_no)}`} label={`Fees for ${s.first_name}`} icon={Wallet} />}
          {canAttendance && <QuickAction href={`/attendance/${s.section_id}`} label={`Attendance for ${s.class_name} – ${s.section_name}`} icon={CalendarCheck} />}
          <Button variant="ghost" size="icon-sm" aria-label={`Copy admission number ${s.admission_no}`} title="Copy admission number"
            onClick={() => navigator.clipboard?.writeText(s.admission_no).then(() => toast.success("Admission number copied", { description: s.admission_no }))}>
            <Copy aria-hidden />
          </Button>
        </div>
      ),
    },
  ], [canFees, canAttendance]);

  const noClasses = classes.data && classes.data.length === 0;
  const filtered = Boolean(q) || classId !== "all" || status !== "active";

  return (
    <>
      <PageHeader
        title="Students"
        description={students.data?.meta ? `${students.data.meta.total.toLocaleString("en-IN")} ${status === "all" ? "" : STATUS[status].toLowerCase() + " "}students` : "Every student, their class and their parents."}
        actions={!noClasses && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="h-9" />}><Download aria-hidden />Export</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => exportCsv("/transfer/students/export", "students")}><GraduationCap aria-hidden />Students with parents</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv("/transfer/parents/export", "parents")}><Users aria-hidden />Parents with children</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {manage && <Button variant="outline" className="h-9" onClick={() => setImporting(true)}><Upload aria-hidden />Import</Button>}
            {manage && <Link href="/students/new" className={buttonVariants({ className: "h-9" })}><Plus aria-hidden />Add student</Link>}
          </>
        )}
      />

      {noClasses ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          illustration={<StudentsIllustration />}
          title="Add classes first"
          description="Every student belongs to a class and section. Set up your classes, then come back to add students."
          action={<Link href="/academics/classes" className={buttonVariants()}>Set up classes</Link>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row">
            <div className="relative lg:max-w-xs lg:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or admission no." className="h-9 pl-9" aria-label="Search students" />
            </div>
            <Select value={classId} onValueChange={(v) => { setClassId(String(v)); setSectionId("all"); setPage(1); }}>
              <SelectTrigger className="h-9 lg:w-44" aria-label="Filter by class"><SelectValue>{classId === "all" ? "All classes" : selectedClass?.name ?? "Class"}</SelectValue></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All classes</SelectItem>
                {classes.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sectionId} onValueChange={(v) => { setSectionId(String(v)); setPage(1); }} disabled={!selectedClass}>
              <SelectTrigger className="h-9 lg:w-36" aria-label="Filter by section">
                <SelectValue>{sectionId === "all" ? "All sections" : `Section ${selectedClass?.sections.find((s) => s.id === sectionId)?.name ?? ""}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {selectedClass?.sections.map((s) => <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(String(v)); setPage(1); }}>
              <SelectTrigger className="h-9 lg:w-36" aria-label="Filter by status"><SelectValue>{STATUS[status]}</SelectValue></SelectTrigger>
              <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DataTable
            caption="Students"
            columns={columns}
            data={students.data?.data ?? []}
            meta={students.data?.meta}
            loading={students.isLoading}
            refreshing={students.isFetching && !students.isLoading}
            page={page} onPageChange={setPage}
            getRowId={(s) => s.id}
            empty={
              <EmptyState
                illustration={<StudentsIllustration />}
                title={filtered ? "No students match" : "No students yet"}
                description={filtered ? "Try a different search or filter." : "Add your first student to get started."}
                action={manage && !filtered && <Button onClick={() => router.push("/students/new")}><Plus aria-hidden />Add student</Button>}
              />
            }
          />
        </>
      )}
      {manage && <ImportDialog kind="students" open={importing} onOpenChange={setImporting} />}
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="students.view">
      <Suspense>
        <StudentsPage />
      </Suspense>
    </PermissionGate>
  );
}
