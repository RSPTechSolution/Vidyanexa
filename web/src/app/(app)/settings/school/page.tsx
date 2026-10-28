"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { PhotoUpload } from "@/components/common/files";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { useCan } from "@/components/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import type { School } from "@/lib/api/types";
import { downloadFile } from "@/lib/download";
import { qk, useCurrentSchool } from "@/lib/queries";
import { DEFAULT_ACCENTS, accentTokens } from "@/lib/theme/palette";
import { cn } from "@/lib/utils";
import { timeZoneOptions, tzLabel } from "@/lib/timezones";

const optional = (max: number) => z.string().trim().max(max);
const schema = z.object({
  name: z.string().trim().min(2, "Enter the school name").max(200),
  phone: optional(20),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  address: optional(500),
  city: optional(100),
  state: optional(100),
  timezone: z.string().min(1),
  currency: z.string().length(3, "Use a 3-letter code such as INR"),
});
type Values = z.infer<typeof schema>;

const CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR", "SGD", "NPR", "BDT", "LKR", "KES", "NGN"];

function toValues(s: School): Values {
  return {
    name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
    city: s.city ?? "", state: s.state ?? "", timezone: s.timezone, currency: s.currency,
  };
}

function SchoolProfilePage() {
  const can = useCan();
  const editable = can("school.manage");
  const school = useCurrentSchool();
  const queryClient = useQueryClient();
  const router = useRouter();
  const savedTz = school.data?.timezone;
  const timezones = useMemo(() => timeZoneOptions(savedTz), [savedTz]);

  // Every field starts defined so inputs stay controlled while the school loads.
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", email: "", address: "", city: "", state: "", timezone: "Asia/Kolkata", currency: "INR" },
  });
  const { register, handleSubmit, reset, control, setError, formState: { errors, isDirty, dirtyFields } } = form;
  useEffect(() => {
    if (school.data) reset(toValues(school.data));
  }, [school.data, reset]);

  const save = useMutation({
    // Only send what the user changed, so a field can never be overwritten by accident.
    mutationFn: (v: Values) => {
      const changed = Object.fromEntries(
        (Object.keys(dirtyFields) as (keyof Values)[]).map((k) => [k, typeof v[k] === "string" && v[k] === "" && k !== "name" ? null : v[k]]),
      );
      return api<School>("/schools/current", { method: "PATCH", body: changed });
    },
    onSuccess: ({ data }) => {
      queryClient.setQueryData(qk.school, data);
      reset(toValues(data));
      router.refresh(); // school name in the sidebar comes from the server session
      toast.success("School profile saved");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) {
        for (const [field, message] of Object.entries(e.fieldErrors)) setError(field as keyof Values, { message });
      } else toast.error(e instanceof ApiError ? e.message : "Could not save");
    },
  });

  return (
    <>
      <PageHeader title="School profile" description="Shown on receipts, certificates, report cards and messages to parents." />
      {!editable && (
        <Alert className="mb-6"><AlertDescription>Only school admins can change these details.</AlertDescription></Alert>
      )}
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>School ID: <code className="font-mono text-foreground">{school.data?.slug ?? "…"}</code>, used in your school&apos;s web links such as the admissions form. Everyone signs in with their own email.</CardDescription>
          </CardHeader>
          <CardContent>
            {school.isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : (
              <fieldset disabled={!editable || save.isPending} className="grid gap-5 sm:grid-cols-2">
                <Field label="School name" error={errors.name?.message} required className="sm:col-span-2">
                  {(a) => <Input {...a} {...register("name")} />}
                </Field>
                <Field label="Phone" error={errors.phone?.message}>
                  {(a) => <Input {...a} {...register("phone")} type="tel" autoComplete="tel" />}
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  {(a) => <Input {...a} {...register("email")} type="email" />}
                </Field>
                <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
                  {(a) => <Input {...a} {...register("address")} autoComplete="street-address" />}
                </Field>
                <Field label="City" error={errors.city?.message}>
                  {(a) => <Input {...a} {...register("city")} />}
                </Field>
                <Field label="State" error={errors.state?.message}>
                  {(a) => <Input {...a} {...register("state")} />}
                </Field>
                <Field label="Time zone" hint="Used for attendance dates, reminders and reports." error={errors.timezone?.message}>
                  {(a) => (
                    <Controller control={control} name="timezone" render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v)} disabled={!editable}>
                        <SelectTrigger id={a.id} className="w-full"><SelectValue>{tzLabel(field.value)}</SelectValue></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {timezones.map((tz) => <SelectItem key={tz} value={tz}>{tzLabel(tz)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                  )}
                </Field>
                <Field label="Currency" error={errors.currency?.message}>
                  {(a) => (
                    <Controller control={control} name="currency" render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v)} disabled={!editable}>
                        <SelectTrigger id={a.id} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  )}
                </Field>
              </fieldset>
            )}
          </CardContent>
          {editable && (
            <CardFooter className="justify-end gap-2 border-t">
              <Button type="button" variant="outline" disabled={!isDirty || save.isPending} onClick={() => school.data && reset(toValues(school.data))}>
                Discard
              </Button>
              <Button type="submit" disabled={!isDirty} loading={save.isPending} loadingText="Saving…">
                Save changes
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Shown on the website, receipts and report cards. A square PNG or JPG works best.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <PhotoUpload
            fileId={school.data?.logo_url?.split("/files/public/")[1]}
            purpose="school_logo"
            ownerId={school.data?.id ?? ""}
            canEdit={editable}
            onChanged={() => queryClient.invalidateQueries({ queryKey: qk.school })}
            className="size-20 rounded-xl border bg-muted text-xs text-muted-foreground"
            fallback="No logo"
          />
          <p className="text-sm text-muted-foreground">{editable ? "Click the square to upload a new logo." : "Only school admins can change the logo."}</p>
        </CardContent>
      </Card>
      <BrandCard current={(school.data?.settings as { brand_color?: string } | undefined)?.brand_color ?? null} editable={editable} />
      {can("school.export") && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>Download everything your school has entered: students, staff, attendance, fees, exams and the rest, one CSV file per table. Passwords are never included.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => downloadFile("/schools/current/export", "school-data.zip").catch((e) => toast.error(e.message))}><FileDown aria-hidden />Download all school data</Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const BRAND_COLORS = [
  ["#15233F", "Navy"], ["#4f46e5", "Indigo"], ["#2563eb", "Blue"], ["#0f766e", "Teal"], ["#15803d", "Green"],
  ["#b45309", "Amber"], ["#be123c", "Maroon"], ["#7e22ce", "Purple"], ["#334155", "Slate"],
] as const;

/** A small sample of the app in one mode, drawn with the palette generated from `hex`. */
function AccentPreview({ hex, dark }: { hex: string; dark: boolean }) {
  const vars = Object.fromEntries(Object.entries(accentTokens(DEFAULT_ACCENTS.includes(hex.toLowerCase()) ? "#2f4a86" : hex, dark)).map(([k, v]) => [`--${k}`, v]));
  return (
    <div aria-hidden style={vars as React.CSSProperties} className="overflow-hidden rounded-2xl border border-border bg-background text-foreground transition-colors duration-300">
      <div className="flex">
        <div className="hidden w-28 shrink-0 space-y-1.5 bg-sidebar p-2.5 sm:block">
          <div className="rounded-full bg-sidebar-primary px-2.5 py-1 text-[11px] font-semibold text-sidebar-primary-foreground">Dashboard</div>
          <div className="px-2.5 py-1 text-[11px] text-sidebar-muted">Students</div>
          <div className="px-2.5 py-1 text-[11px] text-sidebar-muted">Fees</div>
        </div>
        <div className="flex-1 space-y-2.5 p-3">
          <div className="rounded-xl bg-panel px-3 py-2.5 text-xs font-semibold text-panel-foreground">Good morning</div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl border border-border bg-card p-2 text-[11px]"><span className="text-muted-foreground">Attendance</span><div className="text-sm font-semibold">94%</div></div>
            <div className="flex-1 rounded-xl bg-primary-container p-2 text-[11px] text-primary-container-foreground">Fees<div className="text-sm font-semibold">₹48,500</div></div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">Save</span>
            <span className="rounded-full border border-input px-3 py-1 text-[11px] font-medium text-primary">Cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandCard({ current, editable }: { current: string | null; editable: boolean }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (color: string) => api("/schools/current", { method: "PATCH", body: { settings: { brand_color: color } } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.school }); toast.success("Colour saved. Reloading…"); setTimeout(() => window.location.reload(), 600); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });
  const active = current ?? "#15233F";
  const [picked, setPicked] = useState<string>(active);
  useEffect(() => setPicked(active), [active]); // the saved colour arrives after the page opens
  const name = BRAND_COLORS.find(([h]) => h === picked)?.[1] ?? "Custom";
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>School colour</CardTitle>
        <CardDescription>
          Vidyanexa builds a full light and dark colour scheme from this colour: buttons, the menu, highlights and charts,
          for everyone at your school. Text always keeps a readable contrast.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div role="radiogroup" aria-label="School colour" className="flex flex-wrap gap-3">
          {BRAND_COLORS.map(([hex, label]) => (
            <button key={hex} type="button" role="radio" aria-checked={picked === hex} aria-label={label} disabled={!editable || save.isPending}
              onClick={() => setPicked(hex)}
              className={cn("size-10 rounded-full ring-offset-2 ring-offset-background transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:scale-100",
                picked === hex && "ring-2 ring-foreground")}
              style={{ background: hex }} />
          ))}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Preview: {name}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="mb-1.5 text-xs text-muted-foreground">Light</p><AccentPreview hex={picked} dark={false} /></div>
            <div><p className="mb-1.5 text-xs text-muted-foreground">Dark</p><AccentPreview hex={picked} dark /></div>
          </div>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button onClick={() => save.mutate(picked)} disabled={picked === active} loading={save.isPending} loadingText="Saving…">Use {name}</Button>
            {picked !== active && <Button variant="ghost" onClick={() => setPicked(active)}>Cancel</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="school.view">
      <SchoolProfilePage />
    </PermissionGate>
  );
}
