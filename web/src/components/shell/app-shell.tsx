"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageTransition } from "@/components/motion/primitives";
import { SessionProvider } from "@/components/session-provider";
import { Header } from "@/components/shell/header";
import { PlatformBanner, type Platform } from "@/components/shell/platform-banner";
import { SubscriptionEnded, SubscriptionEndedBanner } from "@/components/shell/subscription-ended";
import { rememberSidebar } from "@/components/shell/shell-cookies";
import { Sidebar, SidebarBrand, SidebarNav } from "@/components/shell/sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Me } from "@/lib/api/types";
import { accentCss } from "@/lib/theme/palette";

// The search palette's code loads the first time someone opens it, not with every page.
const CommandPalette = dynamic(() => import("@/components/shell/command-palette").then((m) => m.CommandPalette), { ssr: false });

export function AppShell({ me, collapsed: initiallyCollapsed, platform, bannerHidden, children }: {
  me: Me; collapsed: boolean; platform: Platform | null; bannerHidden: string | null; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchUsed, setSearchUsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const openSearch = (open: boolean) => {
    if (open) setSearchUsed(true);
    setSearchOpen(open);
  };

  // Ctrl/Cmd+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchUsed(true);
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The school's accent colour, as a full light and dark palette on the whole document, so dialogs and menus (rendered in
  // portals) match. It's in the server HTML, so the page never flashes the default navy first.
  const brand = me.school?.brand_color;
  const brandCss = useMemo(() => (brand ? accentCss(brand) : null), [brand]);

  // Accounts created with a temporary password must set their own first.
  useEffect(() => {
    if (me.must_change_password && pathname !== "/account") router.replace("/account?required=1");
  }, [me.must_change_password, pathname, router]);

  // The school's trial is over (or its plan ran out): admins go to the plan page to pay, everyone else is told why.
  const ended = me.school?.subscription_ended ?? null;
  const canPay = me.permissions.includes("billing.view");
  const openWhenEnded = pathname.startsWith("/settings/billing") || pathname.startsWith("/account");
  useEffect(() => {
    if (ended && canPay && !openWhenEnded) router.replace("/settings/billing");
  }, [ended, canPay, openWhenEnded, router]);

  const toggle = () =>
    setCollapsed((c) => {
      rememberSidebar(!c);
      return !c;
    });

  return (
    <SessionProvider me={me}>
      {brandCss && <style>{brandCss}</style>}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBrand />
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <PlatformBanner initial={platform} hiddenId={bannerHidden} />
          <Header onOpenMobileNav={() => setMobileOpen(true)} onOpenSearch={() => openSearch(true)} />
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 print:p-0">
            <div className="mx-auto w-full max-w-7xl">
              {ended && !openWhenEnded ? <SubscriptionEnded reason={ended} canPay={canPay} /> : (
                <>
                  {/* The plan page says so itself; the account page doesn't. */}
                  {ended && !pathname.startsWith("/settings/billing") && <SubscriptionEndedBanner reason={ended} />}
                  <PageTransition key={pathname}>{children}</PageTransition>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
      {searchUsed && <CommandPalette open={searchOpen} onOpenChange={openSearch} />}
    </SessionProvider>
  );
}
