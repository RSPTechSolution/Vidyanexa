"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CreditCard, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { UsageBar, formatBytes } from "@/components/common/usage-bar";
import { CustomBuilder, type CustomSelection } from "@/components/pricing/custom-builder";
import { CycleToggle, PlanCards, planPrice } from "@/components/pricing/plan-cards";
import { useCan } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api/client";
import type { BillingCycle, Checkout, Plan, SubscriptionPayment } from "@/lib/api/types";
import { formatDate, formatMoney, inr } from "@/lib/format";
import { withGst } from "@/lib/gst";
import { usePricingCatalog, useSubscription } from "@/lib/queries";

type Target = { code: string; name: string; custom?: CustomSelection; monthly: number; yearly: number };

/** Pay for a plan online: the plan price for the cycle, 18% GST on top, and the total. Only the subscription is paid
 *  online; school fees never are. In test mode the "bank" is simulated. */
function CheckoutDialog({ target, cycle, testMode, onClose }: { target: Target | null; cycle: BillingCycle; testMode: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const charge = target ? (cycle === "yearly" ? target.yearly : target.monthly) : 0;
  const t = withGst(charge);
  const pay = useMutation({
    mutationFn: async (outcome: "success" | "failure") => {
      const order = (await api<Checkout>("/subscription/checkout", {
        method: "POST",
        body: { plan_code: target!.code, billing_cycle: cycle, ...(target!.custom ? { custom_modules: target!.custom.modules, custom_students: target!.custom.students } : {}) },
      })).data;
      return (await api<{ status: string; message: string; payment: SubscriptionPayment | null }>(`/subscription/payments/${order.payment_id}/confirm`, {
        method: "POST", body: { outcome },
      })).data;
    },
    onSuccess: (r) => {
      if (r.status !== "paid") { toast.error(r.message); return; }
      for (const k of [["subscription"], ["subscription-payments"], ["school"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      router.refresh(); // the sidebar's modules follow the plan
      onClose();
      toast.success(r.message, { description: r.payment?.invoice_no ? `Invoice ${r.payment.invoice_no} · ${formatMoney(r.payment.total)} paid` : undefined });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "The payment didn't go through"),
  });
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && !pay.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay for {target?.name}</DialogTitle>
          <DialogDescription>{cycle === "yearly" ? "Billed yearly (2 months free)." : "Billed monthly."} Your plan starts as soon as the payment goes through.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 rounded-xl border p-4 text-sm tabular">
          <div className="flex justify-between"><dt className="text-muted-foreground">{target?.name}, {cycle === "yearly" ? "1 year" : "1 month"}</dt><dd>{formatMoney(t.base)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">GST ({Math.round(t.rate * 100)}%)</dt><dd>{formatMoney(t.gst)}</dd></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd>{formatMoney(t.total)}</dd></div>
        </dl>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          A GST invoice is issued with every payment.{testMode ? " Payments are in test mode: no money is taken." : ""}</p>
        <DialogFooter>
          {testMode && <Button variant="ghost" onClick={() => pay.mutate("failure")} disabled={pay.isPending}>Simulate a failed payment</Button>}
          <Button onClick={() => pay.mutate("success")} loading={pay.isPending} loadingText="Processing payment…"><CreditCard aria-hidden />Pay {formatMoney(t.total)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Invoices for what the school has paid Vidyanexa, with the GST shown separately. */
function PaymentHistory() {
  const q = useQuery({ queryKey: ["subscription-payments"], queryFn: async () => (await api<SubscriptionPayment[]>("/subscription/payments")).data });
  return (
    <Card className="mt-6">
      <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-4" aria-hidden />Payments and invoices</CardTitle><CardDescription>Your payments to Vidyanexa for the plan, with GST.</CardDescription></CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-24" /> : !q.data?.length ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Subscription payments</caption>
              <thead><tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-semibold">Invoice</th><th className="py-2 pr-3 font-semibold">Plan</th><th className="py-2 pr-3 font-semibold">Period</th>
                <th className="py-2 pr-3 text-right font-semibold">Price</th><th className="py-2 pr-3 text-right font-semibold">GST</th><th className="py-2 text-right font-semibold">Total</th>
              </tr></thead>
              <tbody>
                {q.data.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs">{p.invoice_no}<span className="block font-sans text-muted-foreground">{formatDate(p.paid_at)}</span></td>
                    <td className="py-2.5 pr-3">{p.plan_name}<span className="block text-xs text-muted-foreground capitalize">{p.billing_cycle}</span></td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(p.period_start)} – {formatDate(p.period_end)}</td>
                    <td className="py-2.5 pr-3 text-right tabular">{formatMoney(p.base_amount)}</td>
                    <td className="py-2.5 pr-3 text-right tabular">{formatMoney(p.gst_amount)}</td>
                    <td className="py-2.5 text-right font-semibold tabular">{formatMoney(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  trialing: { label: "Free trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Payment due", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

function BillingPage() {
  const can = useCan();
  const manage = can("billing.manage");
  const sub = useSubscription();
  const catalog = usePricingCatalog();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [buying, setBuying] = useState<Target | null>(null);

  const change = useMutation({
    mutationFn: (t: Target) =>
      api<{ changed: boolean; message: string }>("/subscription/change", {
        method: "POST",
        body: {
          plan_code: t.code,
          billing_cycle: cycle ?? sub.data?.billing_cycle ?? "yearly",
          ...(t.custom ? { custom_modules: t.custom.modules, custom_students: t.custom.students } : {}),
        },
      }),
    onSuccess: ({ data }) => {
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["school"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.refresh(); // sidebar modules depend on the plan
      toast.success(data.changed ? "Plan updated" : "Request sent", { description: data.message });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not change the plan"),
  });

  if (sub.isLoading || !sub.data) {
    return (
      <>
        <PageHeader title="Plan & billing" />
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      </>
    );
  }

  const s = sub.data;
  const activeCycle = cycle ?? s.billing_cycle;
  const status = STATUS_LABEL[s.status] ?? { label: s.status, tone: "info" as const };
  const labels = Object.fromEntries((catalog.data?.modules ?? []).map((m) => [m.module, m.label]));
  const price = planPrice(s.plan, s.billing_cycle);
  const verb = s.can_self_change ? "Switch" : "Request";
  const payOnline = s.online_payment && manage;
  const asTarget = (p: Plan): Target => ({ code: p.code, name: p.name, monthly: p.price_monthly, yearly: p.price_yearly });

  return (
    <>
      <PageHeader title="Plan & billing" description="Your subscription, usage and what each plan includes." />

      {s.status === "trialing" && !s.trial_expired && (
        <Alert className="mb-6 border-info/30 bg-info/5">
          <CalendarClock className="text-info" aria-hidden />
          <AlertTitle>{s.trial_days_left} {s.trial_days_left === 1 ? "day" : "days"} left in your free trial</AlertTitle>
          <AlertDescription>Your trial ends on {formatDate(s.trial_ends_at)}. You can switch plans freely until then.</AlertDescription>
        </Alert>
      )}
      {s.trial_expired && (
        <Alert className="mb-6 border-warning/40 bg-warning/5">
          <CalendarClock className="text-warning" aria-hidden />
          <AlertTitle>Your free trial has ended</AlertTitle>
          <AlertDescription>{s.online_payment ? "Pay for a plan below to keep using Vidyanexa. Your data is safe." : "Choose a plan below and our team will contact you to activate it. Your data is safe."}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Current plan</p>
              <StatusBadge tone={status.tone} label={status.label} />
            </div>
            <p className="font-heading text-3xl font-semibold">{s.plan.name}</p>
            <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground tabular">{price.headline}</span>{price.unit}</p>
            <p className="text-xs text-muted-foreground">{price.withTax}</p>
            {s.current_period_end && s.status === "active" && <p className="pt-2 text-xs text-muted-foreground">Paid until {formatDate(s.current_period_end)}</p>}
            {payOnline && (
              <Button className="mt-3 w-full" variant={s.status === "active" ? "outline" : "default"} onClick={() => setBuying(asTarget(s.plan))}>
                <CreditCard aria-hidden />{s.status === "active" ? "Renew early" : `Pay and activate ${s.plan.name}`}
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-6 sm:grid-cols-3">
            <UsageBar label="Students" used={s.usage.students} limit={s.plan.max_students} />
            <UsageBar label="Staff accounts" used={s.usage.staff} limit={s.plan.max_staff} />
            <UsageBar label="Storage" used={s.usage.storage_bytes} limit={s.plan.storage_gb * 1024 ** 3} format={formatBytes}
                    hint={s.usage.storage_bytes >= s.plan.storage_gb * 1024 ** 3 ? "Storage is full: new uploads are paused. Remove old files or upgrade." : "Storage is nearly full. Remove old files or upgrade before it fills up."} />
            <div>
              <p className="text-sm font-medium">Modules</p>
              <p className="mt-1 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{s.plan.modules.length}</span> of {Object.keys(labels).length || 16} included</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.plan.storage_gb} GB storage</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Change plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.online_payment ? "Pay online for the plan you want; it starts straight away. Prices are shown with GST." : s.can_self_change ? "During your trial, changes apply immediately." : "Pick a plan and our team will contact you to complete the change."}
          </p>
        </div>
        <CycleToggle value={activeCycle} onChange={setCycle} />
      </div>

      <Tabs defaultValue="plans" className="mt-6">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="custom">Custom plan</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="mt-6">
          <PlanCards
            plans={s.available_plans}
            cycle={activeCycle}
            currentCode={s.plan.code}
            moduleLabels={labels}
            renderCta={(p: Plan) =>
              p.code === s.plan.code ? (
                <Button variant="outline" size="lg" className="h-11 w-full" disabled><CheckCircle2 aria-hidden />Your current plan</Button>
              ) : payOnline ? (
                <div className="space-y-2">
                  <Button size="lg" variant={p.highlight ? "default" : "outline"} className="h-11 w-full" onClick={() => setBuying(asTarget(p))}>
                    <CreditCard aria-hidden />Buy {p.name}
                  </Button>
                  {s.can_self_change && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setTarget(asTarget(p))}>Try it free until {formatDate(s.trial_ends_at)}</Button>
                  )}
                </div>
              ) : (
                <Button
                  size="lg"
                  variant={p.highlight ? "default" : "outline"}
                  className="h-11 w-full"
                  disabled={!manage}
                  onClick={() => setTarget(asTarget(p))}
                >
                  {verb} to {p.name}
                </Button>
              )
            }
          />
          {!manage && <p className="mt-4 text-sm text-muted-foreground">Only school admins can change the plan.</p>}
        </TabsContent>
        <TabsContent value="custom" className="mt-6">
          {catalog.data && (
            <CustomBuilder
              catalog={catalog.data}
              cycle={activeCycle}
              initial={{ modules: s.plan.modules, students: Math.max(catalog.data.min_students, s.plan.max_students ?? 500) }}
              renderCta={(sel, quote) => (
                <Button
                  size="lg"
                  className="h-11 w-full"
                  disabled={!manage || !quote}
                  onClick={() => {
                    if (!quote) return;
                    const t = { code: "custom", name: "a custom plan", custom: sel, monthly: quote.monthly, yearly: quote.yearly };
                    if (payOnline) setBuying(t); else setTarget(t);
                  }}
                >
                  {payOnline ? <><CreditCard aria-hidden />Buy this plan</> : <><Sparkles aria-hidden />{verb} to this plan</>}
                </Button>
              )}
            />
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        pending={change.isPending}
        title={s.can_self_change ? `Switch to ${target?.name}?` : `Request ${target?.name}?`}
        description={
          s.can_self_change
            ? `Your school moves to ${target?.name} for the rest of the trial (then ${inr(target?.monthly ?? 0)}/month + GST). Modules not in the new plan will be switched off.`
            : `We'll send your request to the Vidyanexa team, who will contact you to complete the change.`
        }
        confirmLabel={s.can_self_change ? "Switch plan" : "Send request"}
        onConfirm={() => target && change.mutate(target)}
      />
      <CheckoutDialog target={buying} cycle={activeCycle} testMode={s.test_mode} onClose={() => setBuying(null)} />
      <PaymentHistory />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="billing.view">
      <BillingPage />
    </PermissionGate>
  );
}
