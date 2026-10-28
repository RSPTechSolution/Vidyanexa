"use client";

import { Check, Sparkles } from "lucide-react";
import type { BillingCycle, Plan } from "@/lib/api/types";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CycleToggle({ value, onChange }: { value: BillingCycle; onChange: (c: BillingCycle) => void }) {
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex items-center rounded-full border bg-card p-1 shadow-xs">
      {(["monthly", "yearly"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c === "monthly" ? "Monthly" : (
            <span className="flex items-center gap-1.5">Yearly <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", value === c ? "bg-white/20" : "bg-success/10 text-success")}>2 months free</span></span>
          )}
        </button>
      ))}
    </div>
  );
}

/** How a plan's price reads for a billing cycle. Tax is added only at checkout, so it isn't shown here. */
export function planPrice(plan: Pick<Plan, "price_monthly" | "price_yearly">, cycle: BillingCycle) {
  const charge = cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
  return cycle === "yearly"
    ? { headline: inr(Math.round(plan.price_yearly / 12)), unit: "/month, billed yearly", total: `${inr(plan.price_yearly)} per year`, charge }
    : { headline: inr(plan.price_monthly), unit: "/month", total: "Billed monthly", charge };
}

export const limitText = (n: number | null, noun: string) => (n === null ? `Unlimited ${noun}` : `Up to ${n.toLocaleString("en-IN")} ${noun}`);

export function PlanCards({
  plans, cycle, renderCta, currentCode, moduleLabels,
}: {
  plans: Plan[];
  cycle: BillingCycle;
  renderCta: (plan: Plan) => React.ReactNode;
  currentCode?: string;
  moduleLabels: Record<string, string>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {plans.map((plan) => {
        const price = planPrice(plan, cycle);
        const current = plan.code === currentCode;
        return (
          <article
            key={plan.code}
            aria-labelledby={`plan-${plan.code}`}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-7 shadow-xs transition-shadow hover:shadow-md",
              plan.highlight && "border-primary/50 shadow-lg ring-1 ring-primary/30 lg:-my-3 lg:py-10",
            )}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                <Sparkles className="size-3.5" aria-hidden />Most popular
              </span>
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 id={`plan-${plan.code}`} className="text-xl font-bold">{plan.name}</h3>
              {current && <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Current plan</span>}
            </div>
            <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="font-heading text-4xl font-semibold tracking-tight tabular">{price.headline}</span>
              <span className="text-sm text-muted-foreground">{price.unit}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{price.total}</p>
            <div className="mt-6">{renderCta(plan)}</div>
            <ul className="mt-7 space-y-2.5 text-sm">
              <li className="flex gap-2.5 font-medium"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{limitText(plan.max_students, "students")}</li>
              <li className="flex gap-2.5 font-medium"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{limitText(plan.max_staff, "staff accounts")}</li>
              <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{plan.storage_gb} GB document storage</li>
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{f}</li>
              ))}
            </ul>
            <div className="mt-7 border-t pt-5">
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{plan.modules.length} modules included</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.modules.map((m) => (
                  <span key={m} className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">{moduleLabels[m] ?? m}</span>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
