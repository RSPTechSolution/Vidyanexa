"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Check, PencilLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { CycleToggle, planPrice } from "@/components/pricing/plan-cards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifyCode } from "@/components/auth/verify-code";
import type { BillingCycle, Plan, Quote } from "@/lib/api/types";
import { inr } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { newPassword } from "@/lib/validation";
import { type PageQuery, toSearchParams } from "@/lib/query-params";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

const schema = z.object({
  school_name: z.string().trim().min(2, "Enter your school's name").max(200),
  school_slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "3–50 characters: lowercase letters, numbers and hyphens"),
  city: z.string().trim().max(100),
  full_name: z.string().trim().min(2, "Enter your name").max(200),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().max(20),
  password: newPassword,
  accept_terms: z.boolean().refine((v) => v, "Please accept the terms and privacy policy"),
});
type Values = z.infer<typeof schema>;

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/proxy/public${path}`);
  return (await res.json()).data;
}

export function SignupForm({ initialPlans, query }: { initialPlans: Plan[] | null; query: PageQuery }) {
  const params = toSearchParams(query);
  const hydrated = useHydrated();
  const [planCode, setPlanCode] = useState(params.get("plan") ?? "pro");
  const [cycle, setCycle] = useState<BillingCycle>(params.get("cycle") === "monthly" ? "monthly" : "yearly");
  const customModules = (params.get("modules") ?? "").split(",").filter(Boolean);
  const customStudents = Number(params.get("students") ?? 0) || 0;
  const hasCustom = customModules.length > 0 && customStudents > 0;
  const [error, setError] = useState<string | null>(null);
  // After the form is sent: the school waits for its admin to enter the code sent to their email (and mobile).
  const [pending, setPending] = useState<{ email: string; slug: string; sms: boolean } | null>(null);

  const plans = useQuery({ queryKey: ["public", "plans"], initialData: initialPlans ?? undefined, queryFn: () => publicGet<Plan[]>("/plans") });
  const quote = useQuery({
    queryKey: ["quote", customModules.join(","), customStudents],
    enabled: hasCustom,
    queryFn: async () => {
      const res = await fetch("/api/proxy/public/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: customModules, students: customStudents }),
      });
      return (await res.json()).data as Quote;
    },
  });

  const { register, handleSubmit, setValue, watch, setError: setFieldError, formState: { errors, isSubmitting, dirtyFields } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { school_name: "", school_slug: "", city: "", full_name: "", email: "", phone: "", password: "", accept_terms: false },
  });
  const name = watch("school_name");
  useEffect(() => {
    if (!dirtyFields.school_slug) setValue("school_slug", slugify(name ?? ""));
  }, [name, dirtyFields.school_slug, setValue]);

  const onSubmit = async (v: Values) => {
    setError(null);
    const body = {
      ...v, city: v.city || null, phone: v.phone || null, plan_code: planCode, billing_cycle: cycle,
      ...(planCode === "custom" ? { custom_modules: customModules, custom_students: customStudents } : {}),
    };
    const res = await fetch("/api/proxy/public/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = await res?.json().catch(() => null);
    if (!res?.ok) {
      const err = payload?.error;
      if (err?.code === "SLUG_TAKEN") return setFieldError("school_slug", { message: err.message });
      if (err?.code === "VALIDATION_ERROR") {
        for (const d of err.details ?? []) setFieldError(d.field as keyof Values, { message: String(d.message).replace(/^Value error, /, "") });
        return;
      }
      return setError(err?.message ?? "Could not create your school. Please try again.");
    }
    // Confirm the email before the school opens: the code is on its way.
    setPending({ email: payload.data.email, slug: payload.data.school_slug, sms: (payload.data.verify_by ?? []).includes("sms") });
    document.getElementById("signup-details")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const chosen = plans.data?.find((p) => p.code === planCode);
  const custom = planCode === "custom" ? quote.data : undefined;
  // What's charged per billing cycle after the trial (tax is added at checkout).
  const charge = chosen ? (cycle === "yearly" ? chosen.price_yearly : chosen.price_monthly) : custom ? (cycle === "yearly" ? custom.yearly : custom.monthly) : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Plan */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">1. Your plan</h2>
          <CycleToggle value={cycle} onChange={setCycle} />
        </div>
        <div role="radiogroup" aria-label="Plan" className="mt-5 space-y-3">
          {plans.isLoading && <Skeleton className="h-48 rounded-2xl" />}
          {plans.data?.map((p) => {
            const price = planPrice(p, cycle);
            return (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={planCode === p.code}
                onClick={() => setPlanCode(p.code)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  planCode === p.code ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                )}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", planCode === p.code ? "border-primary bg-primary" : "border-input")}>
                  {planCode === p.code && <Check className="size-3 text-primary-foreground" strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}{p.highlight && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Popular</span>}</span>
                  <span className="block text-sm text-muted-foreground">{p.max_students === null ? "Unlimited students" : `Up to ${p.max_students.toLocaleString("en-IN")} students`} · {p.modules.length} modules</span>
                </span>
                <span className="text-right"><span className="block font-bold tabular">{price.headline}</span><span className="block text-xs text-muted-foreground">/month</span></span>
              </button>
            );
          })}
          {hasCustom && (
            <button
              type="button"
              role="radio"
              aria-checked={planCode === "custom"}
              onClick={() => setPlanCode("custom")}
              className={cn(
                "flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                planCode === "custom" ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
              )}
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", planCode === "custom" ? "border-primary bg-primary" : "border-input")}>
                {planCode === "custom" && <Check className="size-3 text-primary-foreground" strokeWidth={3} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Custom</span>
                <span className="block text-sm text-muted-foreground">{customStudents.toLocaleString("en-IN")} students · {quote.data?.modules.length ?? customModules.length} modules</span>
              </span>
              <span className="text-right">
                <span className="block font-bold tabular">{quote.data ? inr(cycle === "yearly" ? Math.round(quote.data.yearly / 12) : quote.data.monthly) : "…"}</span>
                <span className="block text-xs text-muted-foreground">/month</span>
              </span>
            </button>
          )}
        </div>
        <Link href="/pricing#custom" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <PencilLine className="size-4" aria-hidden />{hasCustom ? "Change custom plan" : "Build a custom plan instead"}
        </Link>
        <div className="mt-8 rounded-2xl border bg-muted/40 p-5 text-sm">
          <p className="font-semibold">Free for 14 days</p>
          <p className="mt-1 text-muted-foreground">No card needed. You can change plans any time during the trial. After it, you pay for the plan online:</p>
          {charge !== null && (
            <dl className="mt-3 space-y-1 tabular">
              <div className="flex justify-between font-semibold"><dt>{chosen?.name ?? "Custom plan"}, {cycle === "yearly" ? "per year" : "per month"}</dt><dd>{inr(charge)}</dd></div>
            </dl>
          )}
        </div>
      </div>

      {/* Details, then the confirmation code */}
      {pending ? (
        <div id="signup-details" className="scroll-mt-24 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <VerifyCode email={pending.email} schoolSlug={pending.slug} bySms={pending.sms} onBack={() => setPending(null)} />
        </div>
      ) : (
      <form id="signup-details" onSubmit={handleSubmit(onSubmit)} noValidate method="post" className="scroll-mt-24 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">2. Your school</h2>
        {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="School name" error={errors.school_name?.message} required className="sm:col-span-2">
            {(a) => <Input {...a} {...register("school_name")} autoComplete="organization" />}
          </Field>
          <Field label="School ID" error={errors.school_slug?.message} required hint="Used in your school&apos;s web links, such as its admissions form.">
            {(a) => <Input {...a} {...register("school_slug")} className="font-mono" autoCapitalize="none" spellCheck={false} />}
          </Field>
          <Field label="City" error={errors.city?.message}>
            {(a) => <Input {...a} {...register("city")} autoComplete="address-level2" />}
          </Field>
        </div>
        <h2 className="mt-8 text-lg font-bold">3. Your admin account</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={errors.full_name?.message} required>
            {(a) => <Input {...a} {...register("full_name")} autoComplete="name" />}
          </Field>
          <Field label="Mobile number" error={errors.phone?.message} hint="Optional. We'll text your code here too.">
            {(a) => <Input {...a} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="98140 12345" />}
          </Field>
          <Field label="Work email" error={errors.email?.message} required className="sm:col-span-2" hint="We'll send a code here to confirm it's yours.">
            {(a) => <Input {...a} {...register("email")} type="email" inputMode="email" autoComplete="email" />}
          </Field>
          <Field label="Password" error={errors.password?.message} required hint="At least 8 characters, with letters and numbers." className="sm:col-span-2">
            {(a) => <Input {...a} {...register("password")} type="password" autoComplete="new-password" />}
          </Field>
        </div>
        <div className="mt-6">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={watch("accept_terms")}
              onCheckedChange={(c) => setValue("accept_terms", Boolean(c), { shouldValidate: true })}
              aria-invalid={errors.accept_terms ? true : undefined}
              className="mt-0.5"
            />
            <span>
              I agree to the <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">terms of service</Link> and{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">privacy policy</Link>.
            </span>
          </label>
          {errors.accept_terms && <p className="mt-1.5 text-xs font-medium text-destructive">{errors.accept_terms.message}</p>}
        </div>
        <Button
          type="submit"
          size="lg"
          className="mt-7 h-11 w-full"
          disabled={!hydrated || (planCode === "custom" && !quote.data)}
          loading={isSubmitting}
          loadingText="Creating your school…"
        >
          Create my school
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already using Vidyanexa? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </form>
      )}
    </div>
  );
}
