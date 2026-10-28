"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, GraduationCap, Lock, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Chip, StudentPicker } from "@/components/academics/pickers";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import type { StudentOption, User } from "@/lib/api/types";
import { SCHOOL_ROLES, roleLabel } from "@/lib/format";
import { generatePassword } from "@/lib/hooks";
import { useRoleRules, useUserDetail } from "@/lib/queries";
import { newPassword } from "@/lib/validation";

const base = {
  full_name: z.string().trim().min(2, "Enter the full name").max(200),
  phone: z.string().trim().max(20),
  role: z.string().min(1, "Choose a role"),
  employee_id: z.string().trim().max(50),
  designation: z.string().trim().max(100),
  license_no: z.string().trim().max(50),
};
const createSchema = z.object({ ...base, email: z.string().trim().email("Enter a valid email"), password: newPassword });
const editSchema = z.object(base);
type CreateValues = z.infer<typeof createSchema>;
type RoleField = "phone" | "employee_id" | "designation" | "license_no";
const ROLE_FIELDS: RoleField[] = ["phone", "employee_id", "designation", "license_no"];
type Child = StudentOption & { relationship: string };

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(() => toast.success("Copied to clipboard"), () => undefined);
}

function PasswordInput({ a, value, onChange }: { a: object; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input {...a} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" autoComplete="off" />
      <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => onChange(generatePassword())} aria-label="Generate password">
        <RefreshCw aria-hidden />
      </Button>
      <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => copy(value)} disabled={!value} aria-label="Copy password">
        <Copy aria-hidden />
      </Button>
    </div>
  );
}

function RoleSelect({ value, onChange, id, disabled, exclude = [] }: { value: string; onChange: (v: string) => void; id: string; disabled?: boolean; exclude?: string[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v))} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose a role">{roleLabel(value)}</SelectValue></SelectTrigger>
      <SelectContent>
        {SCHOOL_ROLES.filter((r) => r === value || !exclude.includes(r)).map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function applyServerErrors(e: unknown, setError: (f: never, v: { message: string }) => void) {
  if (e instanceof ApiError && e.status === 422) {
    for (const [field, message] of Object.entries(e.fieldErrors)) setError(field as never, { message });
    return true;
  }
  if (e instanceof ApiError && e.code === "EMAIL_TAKEN") {
    setError("email" as never, { message: e.message });
    return true;
  }
  return false;
}

/** Add or edit a user. With `forStudent`, it creates that student's own login (from the student's profile). */
export function UserFormDialog({ open, onOpenChange, user, forStudent, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; user?: User | null; forStudent?: StudentOption; onCreated?: (user: User) => void;
}) {
  const editing = Boolean(user);
  const queryClient = useQueryClient();
  const rules = useRoleRules();
  const detail = useUserDetail(open && user ? user.id : null);
  const [children, setChildren] = useState<Child[]>([]);
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(editing ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: { full_name: "", phone: "", role: "teacher", email: "", password: "", employee_id: "", designation: "", license_no: "" },
  });
  const { register, handleSubmit, control, reset, setError, setValue, watch, getValues, formState: { errors } } = form;

  useEffect(() => {
    if (!open) return;
    const extras = { employee_id: user?.employee_id ?? "", designation: user?.designation ?? "", license_no: user?.license_no ?? "" };
    reset(user
      ? { full_name: user.full_name, phone: user.phone ?? "", role: user.role, email: user.email, password: "", ...extras }
      : { full_name: forStudent?.name ?? "", phone: "", role: forStudent ? "student" : "teacher", email: "", password: generatePassword(), ...extras });
    setChildren([]);
    setStudent(forStudent ?? null);
    setLinkError(null);
  }, [open, user, forStudent, reset]);

  const role = watch("role");
  const rule = rules.data?.roles[role] ?? { required: [], optional: [] };
  const shown = ROLE_FIELDS.filter((f) => rule.required.includes(f) || rule.optional.includes(f));
  const isRequired = (f: string) => rule.required.includes(f);
  const label = (f: string) => rules.data?.labels[f] ?? f;
  const linked = rules.data?.linked_roles ?? ["parent", "student"];
  const roleLocked = (editing && linked.includes(user!.role)) || Boolean(forStudent);

  const save = useMutation({
    mutationFn: (v: CreateValues) => {
      const extras = Object.fromEntries(shown.map((f) => [f, v[f].trim() || null]));
      if (editing) return api<User>(`/users/${user!.id}`, { method: "PATCH", body: { full_name: v.full_name, role: v.role, ...extras } });
      return api<User>("/users", {
        method: "POST",
        body: {
          email: v.email, full_name: v.full_name, role: v.role, password: v.password, ...extras,
          children: v.role === "parent" ? children.map((c) => ({ student_id: c.id, relationship: c.relationship })) : undefined,
          student_id: v.role === "student" ? student?.id : undefined,
        },
      });
    },
    onSuccess: ({ data }, v) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", data.id] });
      if (v.role === "parent" || v.role === "student") queryClient.invalidateQueries({ queryKey: ["students"] });
      onOpenChange(false);
      if (!editing) onCreated?.(data);
      toast.success(editing ? "User updated" : `Account created for ${data.full_name}`, {
        description: editing ? undefined : `Share the temporary password ${v.password} — they'll be asked to change it.`,
        duration: editing ? 4000 : 15000,
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "PLAN_LIMIT_REACHED") {
        toast.error(e.message, { action: { label: "View plans", onClick: () => window.location.assign("/settings/billing") } });
        return;
      }
      if (e instanceof ApiError && e.status === 422) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const child = /^children\.(\d+)/.exec(field);
          if (child) setLinkError(`${children[Number(child[1])]?.name ?? "Child"}: ${message}`);
          else if (field === "children" || field === "student_id") setLinkError(message);
          else setError(field as keyof CreateValues, { message });
        }
        return;
      }
      if (!applyServerErrors(e, setError as never)) toast.error(e instanceof ApiError ? e.message : "Could not save");
    },
  });

  function submit(v: CreateValues) {
    let ok = true;
    for (const f of shown) {
      if (isRequired(f) && !v[f].trim()) { setError(f, { message: `Enter the ${label(f).toLowerCase()}` }); ok = false; }
    }
    setLinkError(null);
    if (!editing && v.role === "parent" && children.length === 0) { setLinkError("Link at least one child. Parents only see their own children."); ok = false; }
    if (!editing && v.role === "student" && !student) { setLinkError("Choose the student record this login belongs to."); ok = false; }
    if (ok) save.mutate(v);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit user" : forStudent ? `Create a login for ${forStudent.name}` : "Add user"}</DialogTitle>
          <DialogDescription>
            {editing ? "Role changes take effect the next time they sign in." : "They'll sign in with this email and the temporary password."}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={handleSubmit(submit)} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" error={errors.role?.message} required className="sm:col-span-2"
            hint={forStudent ? "A student login shows their own timetable, homework, results and fees." : roleLocked ? "Parent and student accounts are tied to student records, so their role can't change." : undefined}>
            {(a) => (
              <Controller control={control} name="role" render={({ field }) => (
                <RoleSelect id={a.id} value={field.value} disabled={roleLocked} exclude={editing ? linked : []}
                  onChange={(r) => { field.onChange(r); setLinkError(null); }} />
              )} />
            )}
          </Field>

          {!editing && role === "student" && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Student record <span className="text-destructive">*</span></p>
              {student ? (
                <Chip label={student.name} onRemove={forStudent ? undefined : () => setStudent(null)}>
                  <GraduationCap className="size-4 text-primary" aria-hidden />{student.name} · {student.class_section}
                </Chip>
              ) : (
                <StudentPicker withoutLogin onPick={(s) => {
                  setStudent(s);
                  setLinkError(null);
                  if (!getValues("full_name").trim()) setValue("full_name", s.name, { shouldValidate: true });
                }} />
              )}
            </div>
          )}

          <Field label="Full name" error={errors.full_name?.message} required className="sm:col-span-2">
            {(a) => <Input {...a} {...register("full_name")} autoComplete="off" />}
          </Field>
          <Field label="Email" error={errors.email?.message} required={!editing} hint={editing ? "Email can't be changed." : undefined}>
            {(a) => <Input {...a} {...register("email")} type="email" disabled={editing} autoComplete="off" />}
          </Field>
          {shown.map((f) => (
            <Field key={f} label={label(f)} error={errors[f]?.message} required={isRequired(f)}>
              {(a) => <Input {...a} {...register(f)} type={f === "phone" ? "tel" : "text"} autoComplete="off" className={f === "license_no" || f === "employee_id" ? "font-mono" : undefined} />}
            </Field>
          ))}

          {!editing && role === "parent" && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Children <span className="text-destructive">*</span> <span className="font-normal text-muted-foreground">— at least one</span></p>
              {children.length > 0 && (
                <ul className="space-y-2">
                  {children.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2 pl-3">
                      <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm"><span className="font-medium">{c.name}</span> <span className="text-muted-foreground">· {c.class_section}</span></span>
                      <Select value={c.relationship} onValueChange={(r) => setChildren((cs) => cs.map((x) => (x.id === c.id ? { ...x, relationship: String(r) } : x)))}>
                        <SelectTrigger className="h-8 w-28 capitalize" aria-label={`Relationship to ${c.name}`}><SelectValue>{c.relationship}</SelectValue></SelectTrigger>
                        <SelectContent>{(rules.data?.relationships ?? ["father", "mother", "guardian"]).map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remove ${c.name}`} onClick={() => setChildren((cs) => cs.filter((x) => x.id !== c.id))}>
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {children.length < 10 && (
                <StudentPicker pickedIds={children.map((c) => c.id)} onPick={(s) => { setChildren((cs) => [...cs, { ...s, relationship: "guardian" }]); setLinkError(null); }} />
              )}
            </div>
          )}

          {editing && detail.data && (detail.data.children.length > 0 || detail.data.student_name) && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3 sm:col-span-2">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Lock className="size-3.5 text-muted-foreground" aria-hidden />Linked {detail.data.children.length ? "children" : "student record"}</p>
              <div className="flex flex-wrap gap-2">
                {detail.data.children.map((c) => (
                  <Chip key={c.student_id} label={c.name}><span className="capitalize text-muted-foreground">{c.relationship} of</span> {c.name} · {c.class_section}</Chip>
                ))}
                {detail.data.student_name && <Chip label={detail.data.student_name}>{detail.data.student_name}</Chip>}
              </div>
              <p className="text-xs text-muted-foreground">Change links from the student&apos;s profile under Students.</p>
            </div>
          )}

          {linkError && <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{linkError}</p>}

          {!editing && (
            <Field label="Temporary password" error={errors.password?.message} required className="sm:col-span-2" hint="They must change it after signing in.">
              {(a) => <Controller control={control} name="password" render={({ field }) => <PasswordInput a={a} value={field.value ?? ""} onChange={field.onChange} />} />}
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="user-form" loading={save.isPending} loadingText={editing ? "Saving…" : "Creating account…"}>
            {editing ? "Save changes" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SetPasswordDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: User | null }) {
  const schema = z.object({ password: newPassword });
  const { handleSubmit, control, reset, formState: { errors } } = useForm<{ password: string }>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  useEffect(() => {
    if (open) reset({ password: generatePassword() });
  }, [open, reset]);

  const save = useMutation({
    mutationFn: (v: { password: string }) => api(`/users/${user!.id}/set-password`, { method: "POST", body: v }),
    onSuccess: (_d, v) => {
      onOpenChange(false);
      toast.success(`New password set for ${user?.full_name}`, {
        description: `Temporary password: ${v.password}. They've been signed out and must change it at next sign-in.`,
        duration: 15000,
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not set the password"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a temporary password for {user?.full_name}. They&apos;ll be signed out of all devices.</DialogDescription>
        </DialogHeader>
        <form id="pw-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <Field label="Temporary password" error={errors.password?.message} required>
            {(a) => <Controller control={control} name="password" render={({ field }) => <PasswordInput a={a} value={field.value ?? ""} onChange={field.onChange} />} />}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="pw-form" loading={save.isPending} loadingText="Saving…">
            Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
