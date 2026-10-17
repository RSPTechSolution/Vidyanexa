import { cn } from "@/lib/utils";

const fmtCount = (n: number) => n.toLocaleString("en-IN");

/** 2.4 GB, 380 MB, 12 KB: one decimal at most, none when it's whole. */
export function formatBytes(n: number) {
  const units: [string, number][] = [["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024]];
  for (const [unit, size] of units) {
    if (n >= size) return `${Number((n / size).toFixed(n / size >= 100 ? 0 : 1)).toLocaleString("en-IN")} ${unit}`;
  }
  return `${n} bytes`;
}

/** "120 of 300 students" with a bar that turns amber at 80% and red at 100%. `format` shows the numbers (e.g. as sizes). */
export function UsageBar({ label, used, limit, format = fmtCount, hint, className }: {
  label: string; used: number; limit: number | null; format?: (n: number) => string; hint?: React.ReactNode; className?: string;
}) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = !limit ? "bg-primary" : pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular">
          <span className="font-semibold text-foreground">{format(used)}</span>
          {limit === null ? " · unlimited" : ` of ${format(limit)}`}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
        aria-valuenow={used}
        aria-valuetext={limit === null ? format(used) : `${format(used)} of ${format(limit)}`}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${limit ? pct : 8}%` }} />
      </div>
      {hint && limit !== null && pct >= 80 && <p className={cn("mt-1.5 text-xs", pct >= 100 ? "text-destructive" : "text-warning")}>{hint}</p>}
    </div>
  );
}
