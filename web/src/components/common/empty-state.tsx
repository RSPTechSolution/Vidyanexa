import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon, illustration, title, description, action, className,
}: { icon?: LucideIcon; illustration?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {illustration ? (
        <div className="mb-5 flex w-48 justify-center sm:w-56">{illustration}</div>
      ) : Icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-7 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
