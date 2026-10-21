"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark, Wordmark } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { ThemeMenu } from "@/components/shell/theme-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => !href.startsWith("/#") && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0 border-b-border/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Vidyanexa home">
          <BrandMark size={32} />
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                active(l.href) ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <ThemeMenu />
          {signedIn ? (
            <Link href="/dashboard" className={buttonVariants({ className: "h-10 px-5" })}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", className: "h-10 px-4 text-primary" })}>Sign in</Link>
              <Link href="/signup" className={buttonVariants({ className: "h-10 px-5" })}>Start free trial</Link>
            </>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <div className="ml-auto flex items-center lg:hidden"><ThemeMenu /></div>
        <SheetTrigger render={<button type="button" className="inline-flex size-10 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label="Open menu" />}>
            <Menu className="size-5" aria-hidden />
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-6">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <nav aria-label="Mobile" className="mt-8 flex flex-col gap-1">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-muted">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 flex flex-col gap-2 border-t pt-6">
              {signedIn ? (
                <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "h-10" })}>Open dashboard</Link>
              ) : (
                <>
                  <Link href="/signup" onClick={() => setOpen(false)} className={buttonVariants({ size: "lg", className: "h-10" })}>Start free trial</Link>
                  <Link href="/login" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline", size: "lg", className: "h-10" })}>Sign in</Link>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
