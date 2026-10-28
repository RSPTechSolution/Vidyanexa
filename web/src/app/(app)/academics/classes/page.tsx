"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Sparkles, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { ClassesIllustration } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { useCan } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import type { ClassItem, SectionItem } from "@/lib/api/types";
import { useClasses, useUsers } from "@/lib/queries";
import { cn } from "@/lib/utils";

const STANDARD = ["Nursery", "LKG", "UKG", ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)];

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };
}

function errorText(e: unknown) {
  if (e instanceof ApiError) return Object.values(e.fieldErrors)[0] ?? e.message;
  return "Something went wrong";
}

/** Add or rename a class. */
function ClassDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: ClassItem | null }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [sections, setSections] = useState("A, B");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setSections("A, B");
      setError(null);
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/classes/${editing.id}`, { method: "PATCH", body: { name } })
        : api("/classes", { method: "POST", body: { name, sections: sections.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success(editing ? "Class renamed" : `${name.trim()} added`);
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Rename class" : "Add a class"}</DialogTitle>
          <DialogDescription>{editing ? "Students stay in this class." : "Sections can be added or changed later."}</DialogDescription>
        </DialogHeader>
        <form id="class-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Class name" required error={error ?? undefined}>
            {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 6" autoFocus />}
          </Field>
          {!editing && (
            <Field label="Sections" hint="Separate with commas, e.g. A, B, C">
              {(a) => <Input {...a} value={sections} onChange={(e) => setSections(e.target.value)} />}
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="class-form" disabled={!name.trim()} loading={save.isPending} loadingText="Saving…">
            {editing ? "Save" : "Add class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Add or edit a section, including capacity and class teacher (the section's in-charge: one class per teacher). */
function SectionDialog({ target, classes, onClose }: {
  target: { cls: ClassItem; section: SectionItem | null } | null; classes: ClassItem[]; onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const teachers = useUsers({ page: 1, page_size: 100, role: "teacher", is_active: true }, Boolean(target));
  // Which class each teacher is already in charge of (other than this section).
  const inCharge = useMemo(() => new Map(classes.flatMap((c) => c.sections
    .filter((s) => s.class_teacher_id && s.id !== target?.section?.id)
    .map((s) => [s.class_teacher_id!, `${c.name} – ${s.name}`] as const))), [classes, target]);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [teacher, setTeacher] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!target) return;
    setConfirming(false);
    setName(target.section?.name ?? "");
    setCapacity(target.section?.capacity ? String(target.section.capacity) : "");
    setTeacher(target.section?.class_teacher_id ?? "none");
    setError(null);
  }, [target]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, capacity: capacity ? Number(capacity) : null, class_teacher_id: teacher === "none" ? null : teacher };
      return target!.section
        ? api(`/classes/sections/${target!.section.id}`, { method: "PATCH", body })
        : api(`/classes/${target!.cls.id}/sections`, { method: "POST", body });
    },
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success(target?.section ? "Section updated" : `Section ${name.toUpperCase()} added`);
    },
    onError: (e) => setError(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/classes/sections/${target!.section!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success(`Section ${target?.section?.name} deleted`);
    },
    onError: (e) => { setConfirming(false); setError(errorText(e)); },
  });
  const teacherName = teachers.data?.data.find((t) => t.id === teacher)?.full_name;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.section ? `Section ${target.section.name}` : "Add a section"} · {target?.cls.name}</DialogTitle>
          <DialogDescription>Capacity stops new admissions once the section is full.</DialogDescription>
        </DialogHeader>
        <form id="section-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Section name" required>
            {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. C" className="uppercase" />}
          </Field>
          <Field label="Capacity" hint="Leave empty for no limit">
            {(a) => <Input {...a} inputMode="numeric" value={capacity} onChange={(e) => /^\d*$/.test(e.target.value) && setCapacity(e.target.value)} />}
          </Field>
          <Field label="Class teacher (in-charge)" className="sm:col-span-2"
            hint="Marks attendance and approves leave and gate passes for this section. Each teacher can be in charge of one class.">
            {(a) => (
              <Select value={teacher} onValueChange={(v) => setTeacher(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{teacher === "none" ? "Not assigned" : teacherName ?? "Loading…"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {teachers.data?.data.map((t) => {
                    const busy = inCharge.get(t.id);
                    return (
                      <SelectItem key={t.id} value={t.id} disabled={Boolean(busy)}>
                        {t.full_name}{busy && <span className="ml-auto pl-3 text-xs text-muted-foreground">In charge of {busy}</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </Field>
          {error && <p className="text-sm font-medium text-destructive sm:col-span-2" role="alert">{error}</p>}
        </form>
        {confirming && target?.section && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
            <p className="font-medium">Delete section {target.section.name} of {target.cls.name}?</p>
            <p className="mt-0.5 text-muted-foreground">Only a section with no students can be deleted, and a class keeps at least one section.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
              <Button size="sm" variant="destructive" onClick={() => remove.mutate()} loading={remove.isPending} loadingText="Deleting…">Yes, delete</Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {target?.section && !confirming && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => { setError(null); setConfirming(true); }}><Trash2 aria-hidden />Delete section</Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="section-form" disabled={!name.trim()} loading={save.isPending} loadingText="Saving…">Save section</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassCard({ c, manage, onEdit, onDelete, onSection }: {
  c: ClassItem; manage: boolean; onEdit: () => void; onDelete: () => void; onSection: (s: SectionItem | null) => void;
}) {
  return (
    <div className="card-lift flex h-full flex-col rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-bold">{c.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" aria-hidden />{c.student_count} {c.student_count === 1 ? "student" : "students"} · {c.sections.length} {c.sections.length === 1 ? "section" : "sections"}
          </p>
        </div>
        {manage && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} />}><MoreHorizontal aria-hidden /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onSection(null)}><Plus aria-hidden />Add section</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}><Pencil aria-hidden />Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 aria-hidden />Delete class</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ul className="mt-4 grid flex-1 gap-2">
        {c.sections.map((s) => {
          const pct = s.capacity ? Math.min(100, Math.round((s.student_count / s.capacity) * 100)) : 0;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!manage}
                onClick={() => onSection(s)}
                className="group w-full rounded-xl border bg-muted/30 p-3 text-left transition-colors outline-none enabled:hover:border-primary/40 enabled:hover:bg-primary/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Section ${s.name}: ${s.student_count} students${s.capacity ? ` of ${s.capacity}` : ""}${s.class_teacher_name ? `, class teacher ${s.class_teacher_name}` : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-heading text-sm font-bold text-primary">{s.name}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                        <UserRound className="size-3.5 shrink-0" aria-hidden />{s.class_teacher_name ?? "No class teacher"}
                      </span>
                      <span className="font-medium tabular">{s.student_count}{s.capacity ? `/${s.capacity}` : ""}</span>
                    </span>
                    {s.capacity && (
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className={cn("block h-full rounded-full transition-[width] duration-700", pct >= 100 ? "bg-destructive" : pct >= 85 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <Link href={`/students?class_id=${c.id}`} className="mt-4 text-sm font-medium text-primary hover:underline">View students →</Link>
    </div>
  );
}

function ClassesPage() {
  const can = useCan();
  const manage = can("classes.manage");
  const classes = useClasses();
  const invalidate = useInvalidate();
  const [dialog, setDialog] = useState<{ open: boolean; editing: ClassItem | null }>({ open: false, editing: null });
  const [sectionTarget, setSectionTarget] = useState<{ cls: ClassItem; section: SectionItem | null } | null>(null);
  const [deleting, setDeleting] = useState<ClassItem | null>(null);

  const quickSetup = useMutation({
    mutationFn: () => api<{ created: number }>("/classes/bulk", { method: "POST", body: { names: STANDARD, sections: ["A", "B"] } }),
    onSuccess: ({ data }) => { invalidate(); toast.success(`${data.created} classes added with sections A and B`); },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: (c: ClassItem) => api(`/classes/${c.id}`, { method: "DELETE" }),
    onSuccess: (_d, c) => { invalidate(); setDeleting(null); toast.success(`${c.name} deleted`); },
    onError: (e) => { setDeleting(null); toast.error(errorText(e)); },
  });

  const total = classes.data?.reduce((n, c) => n + c.student_count, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Classes & sections"
        description={classes.data?.length ? `${classes.data.length} classes · ${total} students` : "Set up the classes your school teaches. Every student belongs to a class and section."}
        actions={manage && classes.data?.length ? <Button onClick={() => setDialog({ open: true, editing: null })}><Plus aria-hidden />Add class</Button> : undefined}
      />
      {classes.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
      ) : !classes.data?.length ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          illustration={<ClassesIllustration />}
          title="No classes yet"
          description={manage ? "Add the classes your school teaches, or set up Nursery to Class 12 in one click." : "Your school admin hasn't set up classes yet."}
          action={manage && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => quickSetup.mutate()} loading={quickSetup.isPending} loadingText="Setting up…"><Sparkles aria-hidden />Set up Nursery – Class 12</Button>
              <Button variant="outline" onClick={() => setDialog({ open: true, editing: null })}><Plus aria-hidden />Add a class</Button>
            </div>
          )}
        />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.data.map((c) => (
            <StaggerItem key={c.id} className="h-full">
              <ClassCard
                c={c}
                manage={manage}
                onEdit={() => setDialog({ open: true, editing: c })}
                onDelete={() => setDeleting(c)}
                onSection={(s) => setSectionTarget({ cls: c, section: s })}
              />
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <ClassDialog open={dialog.open} editing={dialog.editing} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
      <SectionDialog target={sectionTarget} classes={classes.data ?? []} onClose={() => setSectionTarget(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        pending={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="Only classes with no students can be deleted. Its sections are deleted too."
        confirmLabel="Delete class"
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="students.view">
      <ClassesPage />
    </PermissionGate>
  );
}
