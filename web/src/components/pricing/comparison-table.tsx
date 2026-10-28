import { Check, Minus } from "lucide-react";
import type { Plan } from "@/lib/api/types";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Plan-by-plan comparison of limits and every module. */
export function ComparisonTable({ plans, modules }: { plans: Plan[]; modules: { module: string; label: string }[] }) {
  const highlight = plans.findIndex((p) => p.highlight);
  const cell = (i: number) => cn("px-4 py-3 text-center", i === highlight && "bg-primary/[0.04]");
  const yes = <Check className="mx-auto size-4.5 text-success" aria-label="Included" />;
  const no = <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />;
  const rows: { label: string; render: (p: Plan) => React.ReactNode }[] = [
    { label: "Price (monthly)", render: (p) => <span className="font-semibold tabular">{inr(p.price_monthly)}</span> },
    { label: "Price (yearly)", render: (p) => <span className="tabular">{inr(p.price_yearly)}</span> },
    { label: "Students", render: (p) => (p.max_students === null ? "Unlimited" : p.max_students.toLocaleString("en-IN")) },
    { label: "Staff accounts", render: (p) => (p.max_staff === null ? "Unlimited" : p.max_staff.toLocaleString("en-IN")) },
    { label: "Document storage", render: (p) => `${p.storage_gb} GB` },
    { label: "Parent, staff & driver apps", render: () => yes },
    { label: "Data isolated per school", render: () => yes },
    { label: "Daily backups", render: () => yes },
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Compare plans</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="w-2/5 px-5 py-4 text-left font-semibold">Feature</th>
            {plans.map((p, i) => (
              <th key={p.code} scope="col" className={cn(cell(i), "py-4 font-heading text-base font-bold")}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <th scope="row" className="px-5 py-3 text-left font-medium">{r.label}</th>
              {plans.map((p, i) => <td key={p.code} className={cell(i)}>{r.render(p)}</td>)}
            </tr>
          ))}
          <tr className="border-b bg-muted/40">
            <th scope="colgroup" colSpan={plans.length + 1} className="px-5 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">Modules</th>
          </tr>
          {modules.map((m) => (
            <tr key={m.module} className="border-b last:border-0">
              <th scope="row" className="px-5 py-3 text-left font-normal">{m.label}</th>
              {plans.map((p, i) => <td key={p.code} className={cell(i)}>{p.modules.includes(m.module) ? yes : no}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
