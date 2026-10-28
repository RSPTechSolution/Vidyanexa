"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, KeyRound, Plus, Trash2, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ParentPicker } from "@/components/academics/pickers";
import { SectionTitle, StudentFields, emptyStudent, studentSchema, toApi, type StudentValues } from "@/components/academics/student-fields";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { FadeIn } from "@/components/motion/primitives";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import type { Enquiry, StudentDetail } from "@/lib/api/types";
import { generatePassword } from "@/lib/hooks";
import { useClasses } from "@/lib/queries";

type Relationship = "father" | "mother" | "guardian";
type GuardianDraft =
  | { kind: "existing"; user_id: string; name: string; detail: string; relationship: Relationship }
  | { kind: "new"; full_name: string; phone: string; email: string; relationship: Relationship };

const REL: Relationship[] = ["mother", "father", "guardian"];

function RelationshipSelect({ value, onChange, label }: { value: Relationship; onChange: (r: Relationship) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Relationship)}>
      <SelectTrigger className="h-9 w-32 capitalize" aria-label={label}><SelectValue>{value}</SelectValue></SelectTrigger>
      <SelectContent>{REL.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function NewStudentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const classes = useClasses();
  const form = useForm<StudentValues>({ resolver: zodResolver(studentSchema), defaultValues: emptyStudent() });
  const { register, control, handleSubmit, watch, setValue, setError, formState: { errors } } = form;

  const [guardians, setGuardians] = useState<GuardianDraft[]>([]);
  const [adding, setAdding] = useState<"existing" | "new" | null>(null);
  const [newParent, setNewParent] = useState({ full_name: "", phone: "", email: "" });
  const [loginOn, setLoginOn] = useState(false);
  const [login, setLogin] = useState({ email: "", password: generatePassword() });
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ student: StudentDetail; passwords: Record<string, string> } | null>(null);

  // Admitting from an admission enquiry: fill in what the family already told us.
  const enquiryId = useSearchParams().get("enquiry");
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  useEffect(() => {
    if (!enquiryId) return;
    api<Enquiry>(`/admissions/${enquiryId}`).then(({ data: e }) => {
      setEnquiry(e);
      const [first, ...rest] = e.student_name.split(" ");
      setValue("first_name", first);
      setValue("last_name", rest.join(" "));
      if (e.date_of_birth) setValue("date_of_birth", e.date_of_birth);
      if (e.gender) setValue("gender", e.gender as StudentValues["gender"]);
      if (e.class_id) setValue("class_id", e.class_id);
      if (e.email) setGuardians([{ kind: "new", full_name: e.parent_name, phone: e.phone, email: e.email, relationship: "father" }]);
      else setNewParent({ full_name: e.parent_name, phone: e.phone, email: "" });
    }).catch(() => null);
  }, [enquiryId, setValue]);

  const create = useMutation({
    mutationFn: (v: StudentValues) =>
      api<{ student: StudentDetail; new_parent_passwords: Record<string, string> }>("/students", {
        method: "POST",
        body: {
          ...toApi(v),
          guardians: guardians.map((g) =>
            g.kind === "existing"
              ? { user_id: g.user_id, relationship: g.relationship }
              : { new_parent: { full_name: g.full_name, phone: g.phone, email: g.email }, relationship: g.relationship },
          ),
          login: loginOn ? login : null,
        },
      }),
    onSuccess: async ({ data }) => {
      if (enquiry) {
        await api(`/admissions/${enquiry.id}`, { method: "PATCH", body: { student_id: data.student.id } }).catch(() => null);
        qc.invalidateQueries({ queryKey: ["enquiries"] });
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      if (Object.keys(data.new_parent_passwords).length || loginOn) {
        setDone({ student: data.student, passwords: data.new_parent_passwords });
      } else {
        toast.success(`${data.student.first_name} ${data.student.last_name} added`);
        router.push(`/students/${data.student.id}`);
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) {
        let shown = false;
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          if (field in emptyStudent()) {
            setError(field as keyof StudentValues, { message });
            shown = true;
          } else {
            setFormError(message);
            shown = true;
          }
        }
        if (shown) return;
      }
      setFormError(e instanceof ApiError ? e.message : "Could not add the student");
      if (e instanceof ApiError && e.code === "PLAN_LIMIT_REACHED") {
        toast.error(e.message, { action: { label: "View plans", onClick: () => router.push("/settings/billing") } });
      }
    },
  });

  const addNewParent = () => {
    const { full_name, phone, email } = newParent;
    if (full_name.trim().length < 2 || phone.trim().length < 6 || !/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter the parent's name, phone and a valid email.");
      return;
    }
    setFormError(null);
    setGuardians((g) => [...g, { kind: "new", full_name: full_name.trim(), phone: phone.trim(), email: email.trim(), relationship: g.length ? "father" : "mother" }]);
    setNewParent({ full_name: "", phone: "", email: "" });
    setAdding(null);
  };

  if (classes.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <>
      <Link href="/students" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden />Students</Link>
      <PageHeader title="Add a student" description="Fields marked * are required. Every student belongs to a class and section." />
      {enquiry && (
        <Alert className="mb-6"><AlertDescription>Admitting <strong>{enquiry.student_name}</strong> from an admission enquiry. Their details are filled in; the enquiry is marked admitted when you save.</AlertDescription></Alert>
      )}

      <form onSubmit={handleSubmit((v) => { setFormError(null); create.mutate(v); })} noValidate className="space-y-6">
        <FadeIn>
          <Card>
            <CardContent>
              <SectionTitle step={1} title="Student and admission details" />
              <StudentFields
                control={control}
                register={register}
                errors={errors}
                watch={watch}
                classes={classes.data ?? []}
                onClassChange={() => setValue("section_id", "")}
              />
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.06}>
          <Card>
            <CardContent>
              <SectionTitle step={2} title="Parents and guardians" hint="Recommended. Parents can then follow attendance, fees and homework in the app." />
              {guardians.length > 0 && (
                <ul className="mb-4 divide-y rounded-xl border">
                  {guardians.map((g, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {g.kind === "new" ? <UserPlus className="size-4" aria-hidden /> : <UsersRound className="size-4" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{g.kind === "new" ? g.full_name : g.name}</span>
                        <span className="block text-xs text-muted-foreground">{g.kind === "new" ? `New account · ${g.phone} · ${g.email}` : g.detail}</span>
                      </span>
                      <RelationshipSelect
                        label={`Relationship of ${g.kind === "new" ? g.full_name : g.name}`}
                        value={g.relationship}
                        onChange={(r) => setGuardians((list) => list.map((x, j) => (j === i ? { ...x, relationship: r } : x)))}
                      />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setGuardians((list) => list.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {adding === "existing" && (
                <div className="mb-4">
                  <ParentPicker
                    pickedIds={guardians.flatMap((g) => (g.kind === "existing" ? [g.user_id] : []))}
                    onPick={(u) => {
                      setGuardians((g) => [...g, { kind: "existing", user_id: u.id, name: u.full_name, detail: [u.phone, u.email].filter(Boolean).join(" · "), relationship: g.length ? "father" : "mother" }]);
                      setAdding(null);
                    }}
                  />
                </div>
              )}
              {adding === "new" && (
                <div className="mb-4 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
                  <Field label="Parent's full name" required>{(a) => <Input {...a} value={newParent.full_name} onChange={(e) => setNewParent((p) => ({ ...p, full_name: e.target.value }))} />}</Field>
                  <Field label="Phone" required>{(a) => <Input {...a} type="tel" value={newParent.phone} onChange={(e) => setNewParent((p) => ({ ...p, phone: e.target.value }))} />}</Field>
                  <Field label="Email" required hint="Used to sign in to the parent app.">{(a) => <Input {...a} type="email" value={newParent.email} onChange={(e) => setNewParent((p) => ({ ...p, email: e.target.value }))} />}</Field>
                  <div className="flex gap-2 sm:col-span-3">
                    <Button type="button" onClick={addNewParent}>Add parent</Button>
                    <Button type="button" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              {adding === null && guardians.length < 4 && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setAdding("existing")}><UsersRound aria-hidden />Link an existing parent</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding("new")}><Plus aria-hidden />Add a new parent</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.12}>
          <Card>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <SectionTitle step={3} title="Student login" hint="Optional. Older students can use the app themselves." />
                <Switch checked={loginOn} onCheckedChange={setLoginOn} aria-label="Create a login for this student" />
              </div>
              {loginOn && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Student's email" required>{(a) => <Input {...a} type="email" value={login.email} onChange={(e) => setLogin((l) => ({ ...l, email: e.target.value }))} autoComplete="off" />}</Field>
                  <Field label="Temporary password" required hint="They'll choose their own at first sign-in.">{(a) => <Input {...a} value={login.password} onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))} className="font-mono" autoComplete="off" />}</Field>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
        <div className="flex justify-end gap-2">
          <Link href="/students" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium hover:bg-muted">Cancel</Link>
          <Button type="submit" size="lg" className="h-10 px-6" loading={create.isPending} loadingText="Adding student…">Add student</Button>
        </div>
      </form>

      <Dialog open={Boolean(done)} onOpenChange={(o) => !o && done && router.push(`/students/${done.student.id}`)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{done?.student.first_name} {done?.student.last_name} has been added</DialogTitle>
            <DialogDescription>Share these sign-in details. They sign in with their email, and will be asked to choose a new password.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {Object.entries(done?.passwords ?? {}).map(([email, pw]) => <Credential key={email} who="Parent" email={email} password={pw} />)}
            {loginOn && done && <Credential who="Student" email={login.email} password={login.password} />}
          </ul>
          <DialogFooter>
            <Button onClick={() => done && router.push(`/students/${done.student.id}`)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Credential({ who, email, password }: { who: string; email: string; password: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
      <KeyRound className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block text-xs text-muted-foreground">{who}</span>
        <span className="block truncate font-medium">{email}</span>
        <span className="block font-mono">{password}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copy ${who.toLowerCase()} sign-in details`}
        onClick={() => navigator.clipboard?.writeText(`${email} / ${password}`).then(() => toast.success("Copied"))}
      >
        <Copy aria-hidden />
      </Button>
    </li>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="students.manage">
      <Suspense><NewStudentPage /></Suspense>
    </PermissionGate>
  );
}
