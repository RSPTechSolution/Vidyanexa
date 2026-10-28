"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import type { BillingCycle, PricingCatalog, Quote } from "@/lib/api/types";
import { inr } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { MODULE_META } from "@/lib/module-meta";
import { cn } from "@/lib/utils";

export interface CustomSelection {
  modules: string[];
  students: number;
}

async function fetchQuote(sel: CustomSelection): Promise<Quote> {
  const res = await fetch("/api/proxy/public/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sel),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? "Could not price this plan");
  return body.data;
}

/** Pick modules and a student count; the price comes from the API so it always matches billing. */
export function CustomBuilder({
  catalog, cycle, initial, renderCta,
}: {
  catalog: PricingCatalog;
  cycle: BillingCycle;
  initial?: Partial<CustomSelection>;
  renderCta: (sel: CustomSelection, quote: Quote | undefined) => React.ReactNode;
}) {
  const core = useMemo(() => catalog.modules.filter((m) => m.core).map((m) => m.module), [catalog]);
  const [picked, setPicked] = useState<string[]>(initial?.modules?.filter((m) => !core.includes(m)) ?? ["fees", "communication"]);
  const [students, setStudents] = useState(initial?.students ?? 400);
  const sel = useDebounced({ modules: [...core, ...picked], students }, 200);

  const quote = useQuery({
    queryKey: ["quote", sel],
    queryFn: () => fetchQuote(sel),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });

  const toggle = (m: string) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const q = quote.data;
  const shown = q ? (cycle === "yearly" ? Math.round(q.yearly / 12) : q.monthly) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-2xl border bg-card p-6 shadow-xs">
        <fieldset>
          <legend className="font-heading text-lg font-bold">1. How many students?</legend>
          <div className="mt-4 flex items-center gap-5">
            <Slider
              aria-label="Number of students"
              min={catalog.min_students}
              max={catalog.max_students}
              step={50}
              value={[students]}
              onValueChange={(v) => setStudents(Array.isArray(v) ? v[0] : v)}
              className="flex-1"
            />
            <input
              type="number"
              aria-label="Number of students"
              min={catalog.min_students}
              max={catalog.max_students}
              value={students}
              onChange={(e) => setStudents(Math.min(catalog.max_students, Math.max(catalog.min_students, Number(e.target.value) || 0)))}
              className="h-10 w-28 rounded-lg border bg-background px-3 text-right font-semibold tabular outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {catalog.student_tiers.map((t) => `₹${t.per_student}/student up to ${t.to.toLocaleString("en-IN")}`).join(" · ")}. More than {catalog.max_students.toLocaleString("en-IN")}? Talk to us.
          </p>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="font-heading text-lg font-bold">2. Choose your modules</legend>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {catalog.modules.map((m) => {
              const Icon = MODULE_META[m.module]?.icon;
              const on = m.core || picked.includes(m.module);
              return (
                <button
                  key={m.module}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={m.core}
                  onClick={() => !m.core && toggle(m.module)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary/40 bg-primary/[0.06]" : "hover:border-primary/30 hover:bg-muted/40",
                    m.core && "cursor-default",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {Icon && <Icon className="size-4.5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.core ? "Always included" : MODULE_META[m.module]?.description}</span>
                  </span>
                  {m.core ? <Lock className="size-4 text-muted-foreground" aria-hidden /> : on ? <Check className="size-4.5 text-primary" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <aside className="h-fit rounded-2xl border bg-card p-6 shadow-md lg:sticky lg:top-24" aria-live="polite">
        <p className="text-sm font-semibold text-muted-foreground">Your custom plan</p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-heading text-4xl font-semibold tracking-tight tabular">{shown !== null ? inr(shown) : "—"}</span>
          <span className="text-sm text-muted-foreground">/month</span>
          {quote.isFetching && <Loader2 className="ml-1 size-4 animate-spin text-muted-foreground" aria-label="Updating price" />}
        </p>
        <p className="text-xs text-muted-foreground">
          {q ? (cycle === "yearly" ? `${inr(q.yearly)} billed yearly` : "Billed monthly") : ""}
        </p>
        {quote.isError && <p className="mt-3 text-sm text-destructive">{(quote.error as Error).message}</p>}
        {q && (
          <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Modules</dt><dd>{q.modules.length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Students</dt><dd className="tabular">{q.students.toLocaleString("en-IN")}</dd></div>
            <div className="flex justify-between border-t pt-2 font-semibold"><dt>{cycle === "yearly" ? "Billed yearly" : "Billed monthly"}</dt><dd className="tabular">{inr(cycle === "yearly" ? q.yearly : q.monthly)}</dd></div>
          </dl>
        )}
        {q && <p className="pt-1 text-xs text-muted-foreground">Includes up to {q.max_staff} staff accounts and {q.storage_gb} GB storage.</p>}
        <div className="mt-6">{renderCta({ modules: [...core, ...picked], students }, q)}</div>
      </aside>
    </div>
  );
}
