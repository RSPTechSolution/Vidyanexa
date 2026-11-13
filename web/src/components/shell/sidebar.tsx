"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand/logo";
import { useCan, useSession } from "@/components/session-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { visibleGroups, type NavItem } from "@/config/navigation";
import { useUnreadNotices } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const unread = useUnreadNotices(item.badge === "notices");
  const count = item.badge === "notices" ? unread.data ?? 0 : 0;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
          : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="relative">
        <Icon className="size-[18px] shrink-0" aria-hidden />
        {collapsed && count > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" aria-hidden />}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && count > 0 && (
        <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] leading-5 font-bold text-background tabular">{count > 99 ? "99+" : count}</span>
      )}
      {collapsed && <span className="sr-only">{item.label}</span>}
      {count > 0 && <span className="sr-only">, {count} unread</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const me = useSession();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {visibleGroups(me).map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <p className="mb-1 px-4 text-xs font-medium text-sidebar-muted">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  const me = useSession();
  return (
    <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
      <BrandMark size={30} />
      {!collapsed && (
        <div className="min-w-0 text-sidebar-foreground">
          <Wordmark />
          <p className="mt-1 truncate text-xs text-sidebar-muted" title={me.school?.name}>
            {me.school?.name ?? "Platform administration"}
          </p>
        </div>
      )}
    </div>
  );
}

function PlanChip({ collapsed }: { collapsed: boolean }) {
  const me = useSession();
  const can = useCan();
  if (!me.school || !can("billing.view") || collapsed) return null;
  const trial = me.school.subscription_status === "trialing" && me.school.trial_ends_at;
  const daysLeft = trial ? Math.max(0, Math.ceil((new Date(me.school.trial_ends_at!).getTime() - Date.now()) / 86_400_000)) : 0;
  return (
    <Link
      href="/settings/billing"
      className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-sidebar-accent p-3 transition-colors hover:bg-[color-mix(in_oklch,var(--sidebar-accent),var(--sidebar-foreground)_6%)] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><CreditCard className="size-4" aria-hidden /></span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold text-sidebar-foreground">{me.school.plan.name} plan</span>
        <span className={cn("block text-xs", me.school.subscription_ended ? "font-semibold text-warning" : "text-sidebar-muted")}>
          {me.school.subscription_ended === "trial" ? "Trial ended · choose a plan"
            : me.school.subscription_ended ? "Plan ended · renew now"
            : trial ? `Trial · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : "Manage plan"}
        </span>
      </span>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col print:hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
      aria-label="Sidebar"
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <PlanChip collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-full px-4 text-sm text-sidebar-muted transition-colors outline-none",
            "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
