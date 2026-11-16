import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Accent = "primary" | "success" | "warning" | "info" | "danger";

const ACCENTS: Record<Accent, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
  danger: "bg-destructive/12 text-destructive",
};

/* Theme 4: a soft wash of the card's colour behind its icon (a gradient, not a blur filter, so it's cheap to draw). */
const GLOWS: Record<Accent, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  danger: "text-destructive",
};

export function StatCard({
  label, value, hint, icon: Icon, accent = "primary", href, loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  accent?: Accent;
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "stat-card group relative isolate flex h-full items-start justify-between gap-4 overflow-hidden rounded-2xl border bg-card p-5 shadow-(--card-shadow)",
        href && "card-lift",
      )}
    >
      <span aria-hidden className={cn("glow-soft pointer-events-none absolute -top-16 -right-16 -z-10 size-48", GLOWS[accent])} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="h-8 truncate font-heading text-2xl leading-8 font-extrabold tracking-tight tabular text-foreground">
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </p>
        )}
        {/* The hint line always takes its space, so a card doesn't grow when its data arrives. */}
        {loading ? <Skeleton className="my-0.5 h-3 w-28" /> : <p className="min-h-4 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", ACCENTS[accent])}>
        <Icon className="size-5" aria-hidden />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
