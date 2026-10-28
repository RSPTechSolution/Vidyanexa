"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, MoreHorizontal, Plus, Power, PowerOff, Search, ToggleRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import type { ModuleState, School } from "@/lib/api/types";
import { formatDate, inr } from "@/lib/format";
import { usePage } from "@/components/common/load-more";
import { generatePassword, useDebounced } from "@/lib/hooks";
import { qk, usePricingCatalog, useSchools } from "@/lib/queries";
import { timeZoneOptions, tzLabel } from "@/lib/timezones";
import { newPassword } from "@/lib/validation";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

const schema = z.object({
  name: z.string().trim().min(2, "Enter the school name").max(200),
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "3–50 characters: lowercase letters, numbers and hyphens"),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  admin_full_name: z.string().trim().min(2, "Enter the admin's name"),
  admin_email: z.string().trim().email("Enter a valid email"),
  admin_password: newPassword,
  plan_code: z.string().min(1),
});
type Values = z.infer<typeof schema>;

const PLAN_NAMES: Record<string, string> = { basic: "Basic", pro: "Pro", max: "Max" };
const STATUS_NAMES: Record<string, string> = { trialing: "Trial", active: "Active", past_due: "Payment due", cancelled: "Cancelled" };

function ChangePlanDialog({ school, onClose }: { school: School | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const catalog = usePricingCatalog();
  const [plan, setPlan] = useState("basic");
  const [cycle, setCycle] = useState("yearly");
  const [status, setStatus] = useState("active");
  const [modules, setModules] = useState<string[]>([]);
  const [students, setStudents] = useState("500");
  useEffect(() => {
    if (!school) return;
    setPlan(school.plan.is_custom ? "custom" : school.plan.code);
    setCycle(school.billing_cycle);
    setStatus(school.subscription_status);
  }, [school]);

  const quote = useQuery({
    queryKey: ["quote", modules, students],
    enabled: plan === "custom" && Number(students) > 0,
    queryFn: async () => (await api<{ monthly: number }>("/public/quote", { method: "POST", body: { modules, students: Number(students) } })).data,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => api<School>(`/platform/schools/${school!.id}/plan`, {
      method: "PUT",
      body: { plan_code: plan, billing_cycle: cycle, status, ...(plan === "custom" ? { custom_modules: modules, custom_students: Number(students) } : {}) },
    }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["platform", "schools"] });
      toast.success(`${data.name} is now on ${data.plan.name}`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not change the plan"),
  });

  return (
    <Dialog open={Boolean(school)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change plan · {school?.name}</DialogTitle>
          <DialogDescription>Modules outside the new plan are switched off; new ones are switched on.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-0.5 sm:grid-cols-3">
          <Field label="Plan">
            {(a) => (
              <Select value={plan} onValueChange={(v) => setPlan(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{PLAN_NAMES[plan] ?? "Custom"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_NAMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Billing">
            {(a) => (
              <Select value={cycle} onValueChange={(v) => setCycle(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{cycle === "yearly" ? "Yearly" : "Monthly"}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="yearly">Yearly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(a) => (
              <Select value={status} onValueChange={(v) => setStatus(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{STATUS_NAMES[status]}</SelectValue></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_NAMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          {plan === "custom" && (
            <>
              <Field label="Students" className="sm:col-span-3">
                {(a) => <Input {...a} inputMode="numeric" value={students} onChange={(e) => /^[0-9]*$/.test(e.target.value) && setStudents(e.target.value)} />}
              </Field>
              <fieldset className="sm:col-span-3">
                <legend className="mb-2 text-sm font-medium">Modules</legend>
                <div className="grid grid-cols-2 gap-2">
                  {catalog.data?.modules.map((m) => (
                    <label key={m.module} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={m.core || modules.includes(m.module)} disabled={m.core}
                        onCheckedChange={(c) => setModules((x) => (c ? [...x, m.module] : x.filter((y) => y !== m.module)))} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-sm sm:col-span-3">
                Price: <span className="font-semibold">{quote.data ? `${inr(quote.data.monthly)}/month` : quote.isError ? (quote.error as Error).message : "…"}</span>
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={plan === "custom" && !quote.data} loading={save.isPending} loadingText="Changing…">
            Change plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSchoolDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const timezones = useMemo(() => timeZoneOptions("Asia/Kolkata"), []);
  const { register, handleSubmit, control, reset, setValue, watch, setError, formState: { errors, dirtyFields } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", timezone: "Asia/Kolkata", currency: "INR", admin_full_name: "", admin_email: "", admin_password: "", plan_code: "basic" },
  });
  useEffect(() => {
    if (open) reset({ name: "", slug: "", timezone: "Asia/Kolkata", currency: "INR", admin_full_name: "", admin_email: "", admin_password: generatePassword(), plan_code: "basic" });
  }, [open, reset]);

  const name = watch("name");
  useEffect(() => {
    if (!dirtyFields.slug && name !== undefined) setValue("slug", slugify(name));
  }, [name, dirtyFields.slug, setValue]);

  const create = useMutation({
    mutationFn: (v: Values) => api<School>("/schools", { method: "POST", body: v }),
    onSuccess: ({ data }, v) => {
      queryClient.invalidateQueries({ queryKey: ["platform", "schools"] });
      onOpenChange(false);
      toast.success(`${data.name} is ready`, {
        description: `Admin signs in with ${v.admin_email} and temporary password ${v.admin_password}.`,
        duration: 20000,
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "SLUG_TAKEN") setError("slug", { message: e.message });
      else if (e instanceof ApiError && e.status === 422) Object.entries(e.fieldErrors).forEach(([f, m]) => setError(f as keyof Values, { message: m }));
      else toast.error(e instanceof ApiError ? e.message : "Could not create the school");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New school</DialogTitle>
          <DialogDescription>Creates the school, its first admin account and the default modules.</DialogDescription>
        </DialogHeader>
        <form id="school-form" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate className="grid max-h-[65vh] gap-4 overflow-y-auto px-0.5 sm:grid-cols-2">
          <Field label="School name" error={errors.name?.message} required className="sm:col-span-2">
            {(a) => <Input {...a} {...register("name")} />}
          </Field>
          <Field label="School ID" error={errors.slug?.message} required hint="Used in the school&apos;s web links, such as its admissions form.">
            {(a) => <Input {...a} {...register("slug")} className="font-mono" autoCapitalize="none" spellCheck={false} />}
          </Field>
          <Field label="Currency" error={errors.currency?.message}>
            {(a) => <Input {...a} {...register("currency", { setValueAs: (v: string) => v.toUpperCase() })} maxLength={3} className="uppercase" />}
          </Field>
          <Field label="Time zone" className="sm:col-span-2">
            {(a) => (
              <Controller control={control} name="timezone" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                  <SelectTrigger id={a.id} className="w-full"><SelectValue>{tzLabel(field.value)}</SelectValue></SelectTrigger>
                  <SelectContent className="max-h-72">{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tzLabel(tz)}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field label="Plan" className="sm:col-span-2">
            {(a) => (
              <Controller control={control} name="plan_code" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                  <SelectTrigger id={a.id} className="w-full"><SelectValue>{PLAN_NAMES[field.value] ?? field.value}</SelectValue></SelectTrigger>
                  <SelectContent>{Object.entries(PLAN_NAMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <p className="pt-2 text-sm font-semibold sm:col-span-2">First admin</p>
          <Field label="Full name" error={errors.admin_full_name?.message} required>
            {(a) => <Input {...a} {...register("admin_full_name")} autoComplete="off" />}
          </Field>
          <Field label="Email" error={errors.admin_email?.message} required>
            {(a) => <Input {...a} {...register("admin_email")} type="email" autoComplete="off" />}
          </Field>
          <Field label="Temporary password" error={errors.admin_password?.message} required className="sm:col-span-2" hint="They'll be asked to change it at first sign-in.">
            {(a) => <Input {...a} {...register("admin_password")} className="font-mono" autoComplete="off" />}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" form="school-form" loading={create.isPending} loadingText="Creating school…">
            Create school
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchoolModulesSheet({ school, onClose }: { school: School | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const modules = useQuery({
    queryKey: qk.schoolModules(school?.id ?? ""),
    enabled: Boolean(school),
    queryFn: async () => (await api<ModuleState[]>(`/schools/${school!.id}/modules`)).data,
  });
  const toggle = useMutation({
    mutationFn: ({ module, is_enabled }: { module: string; is_enabled: boolean }) =>
      api(`/schools/${school!.id}/modules/${module}`, { method: "PUT", body: { is_enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.schoolModules(school!.id) }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update"),
  });
  // Modules still being built: hidden from every school unless opened to it here (for testing).
  const previews = useQuery({
    queryKey: ["platform", "preview-modules"],
    enabled: Boolean(school),
    staleTime: Infinity,
    queryFn: async () => (await api<{ module: string; label: string }[]>("/platform/preview-modules")).data,
  });
  const [opened, setOpened] = useState<string[]>([]);
  useEffect(() => { setOpened(((school?.settings?.preview_modules as string[] | undefined) ?? [])); }, [school]);
  const setPreview = useMutation({
    mutationFn: (modules: string[]) => api<School>(`/platform/schools/${school!.id}/preview-modules`, { method: "PUT", body: { modules } }),
    onSuccess: ({ data }) => {
      setOpened((data.settings?.preview_modules as string[] | undefined) ?? []);
      queryClient.invalidateQueries({ queryKey: qk.schoolModules(school!.id) });
      queryClient.invalidateQueries({ queryKey: ["platform", "schools"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update"),
  });
  return (
    <Sheet open={Boolean(school)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Modules · {school?.name}</SheetTitle>
          <SheetDescription>Turn features on or off for this school.</SheetDescription>
        </SheetHeader>
        {!!previews.data?.length && (
          <div className="mx-4 rounded-xl border border-dashed p-3">
            <p className="text-sm font-semibold">In preview</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Not launched: hidden from schools and the website. Open one to this school to test it.</p>
            <ul className="mt-2 divide-y">
              {previews.data.map((m) => (
                <li key={m.module} className="flex items-center justify-between py-2">
                  <label htmlFor={`pm-${m.module}`} className="text-sm font-medium">{m.label}</label>
                  <Switch id={`pm-${m.module}`} checked={opened.includes(m.module)} disabled={setPreview.isPending}
                    onCheckedChange={(c) => setPreview.mutate(c ? [...opened, m.module] : opened.filter((x) => x !== m.module))} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="flex-1 divide-y overflow-y-auto px-4">
          {modules.isLoading
            ? Array.from({ length: 8 }).map((_, i) => <li key={i} className="py-3"><Skeleton className="h-6" /></li>)
            : modules.data?.map((m) => (
                <li key={m.module} className="flex items-center justify-between py-3">
                  <label htmlFor={`sm-${m.module}`} className="text-sm font-medium">{m.label}</label>
                  <Switch id={`sm-${m.module}`} checked={m.is_enabled} disabled={toggle.isPending}
                    onCheckedChange={(c) => toggle.mutate({ module: m.module, is_enabled: c })} />
                </li>
              ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SchoolsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(q);
  const schools = useSchools({ page, search: q || undefined });
  const [creating, setCreating] = useState(false);
  const [modulesFor, setModulesFor] = useState<School | null>(null);
  const [suspend, setSuspend] = useState<School | null>(null);
  const [planFor, setPlanFor] = useState<School | null>(null);

  const setActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api<School>(`/schools/${id}`, { method: "PATCH", body: { is_active } }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["platform", "schools"] });
      setSuspend(null);
      toast.success(`${data.name} ${data.is_active ? "reactivated" : "suspended"}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update"),
  });

  const columns = useMemo<Col<School>[]>(() => [
    {
      id: "school",
      header: "School",
      cell: ({ row: { original: s } }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{s.slug}</p>
        </div>
      ),
    },
    { id: "location", header: "Location", cell: ({ row: { original: s } }) => <span className="text-muted-foreground">{[s.city, s.state].filter(Boolean).join(", ") || "—"}</span> },
    { id: "plan", header: "Plan", cell: ({ row }) => <span>{row.original.plan.name}{row.original.subscription_status === "trialing" && <span className="ml-1.5 text-xs text-muted-foreground">(trial)</span>}</span> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.is_active ? "active" : "suspended"} /> },
    { id: "created", header: "Created", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.created_at)}</span> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: s } }) => (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`} />}><MoreHorizontal aria-hidden /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setPlanFor(s)}><CreditCard aria-hidden />Change plan</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setModulesFor(s)}><ToggleRight aria-hidden />Modules</DropdownMenuItem>
              {s.is_active ? (
                <DropdownMenuItem variant="destructive" onClick={() => setSuspend(s)}><PowerOff aria-hidden />Suspend</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setActive.mutate({ id: s.id, is_active: true })}><Power aria-hidden />Reactivate</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [setActive]);

  return (
    <>
      <PageHeader title="Schools" description="Every school on the platform." actions={<Button onClick={() => setCreating(true)}><Plus aria-hidden />New school</Button>} />
      <div className="relative mb-4 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or ID" className="h-9 pl-9" aria-label="Search schools" />
      </div>
      <DataTable
        caption="Schools"
        columns={columns}
        data={schools.data?.data ?? []}
        meta={schools.data?.meta}
        loading={schools.isLoading}
        refreshing={schools.isFetching && !schools.isLoading}
        page={page} onPageChange={setPage}
        getRowId={(s) => s.id}
        empty={<EmptyState icon={Building2} title={q ? "No schools match" : "No schools yet"} description={q ? undefined : "Create the first school to get started."} />}
      />
      <NewSchoolDialog open={creating} onOpenChange={setCreating} />
      <SchoolModulesSheet school={modulesFor} onClose={() => setModulesFor(null)} />
      <ChangePlanDialog school={planFor} onClose={() => setPlanFor(null)} />
      <ConfirmDialog
        open={Boolean(suspend)}
        onOpenChange={(o) => !o && setSuspend(null)}
        destructive
        pending={setActive.isPending}
        title={`Suspend ${suspend?.name}?`}
        description="Everyone at this school is signed out immediately and can't sign in until you reactivate it. No data is deleted."
        confirmLabel="Suspend school"
        onConfirm={() => suspend && setActive.mutate({ id: suspend.id, is_active: false })}
      />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate superAdmin>
      <SchoolsPage />
    </PermissionGate>
  );
}
