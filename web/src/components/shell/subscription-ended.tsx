"use client";

import { CreditCard, Lock } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type Reason = "trial" | "cancelled" | "expired";

const TITLE: Record<Reason, string> = {
  trial: "Your free trial has ended",
  cancelled: "Your subscription was cancelled",
  expired: "Your plan has expired",
};

/** In place of every page once the school can no longer use Vidyanexa (its data is kept). */
export function SubscriptionEnded({ reason, canPay }: { reason: Reason; canPay: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning"><Lock className="size-6" aria-hidden /></span>
      <h1 className="text-balance font-heading text-xl font-bold">{TITLE[reason]}</h1>
      {canPay ? (
        <>
          <p className="text-sm text-muted-foreground">Choose a plan to keep using Vidyanexa. Everything your school has added is kept safe.</p>
          <Link href="/settings/billing" className={buttonVariants()}><CreditCard aria-hidden />Choose a plan</Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your school&apos;s Vidyanexa account is paused. Please contact the school office; everything is kept safe and comes back
          as soon as the school renews.
        </p>
      )}
    </div>
  );
}

/** Above the plan page, so the admin knows why they were brought here. */
export function SubscriptionEndedBanner({ reason }: { reason: Reason }) {
  return (
    <p role="status" className="mb-6 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span><b>{TITLE[reason]}.</b> Teachers, parents and students can&apos;t use Vidyanexa until you choose a plan. Nothing has been deleted.</span>
    </p>
  );
}
