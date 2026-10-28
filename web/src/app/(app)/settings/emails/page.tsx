"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, MailCheck, MailX, Send, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EmailStatus { provider: "console" | "brevo-api" | "brevo-smtp"; sending: boolean; sender: string; sent_today: number; daily_limit: number }
interface EmailRow { id: string; to_email: string; to_name: string | null; subject: string; kind: string; status: "queued" | "sent" | "failed" | "logged" | "skipped"; error: string | null; created_at: string; sent_at: string | null }

const KIND: Record<string, string> = { welcome: "Welcome", password_reset: "Password reset", password_set: "Password set", fee_receipt: "Fee receipt", test: "Test" };
const STATUS = {
  sent: { label: "Sent", cls: "bg-success/12 text-success", icon: CheckCircle2 },
  queued: { label: "Sending…", cls: "bg-info/12 text-info", icon: Clock },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: MailX },
  logged: { label: "Logged only", cls: "bg-muted text-muted-foreground", icon: Terminal },
  skipped: { label: "Skipped (demo address)", cls: "bg-muted text-muted-foreground", icon: MailX },
} as const;

function EmailsPage() {
  const can = useCan();
  const me = useSession();
  const qc = useQueryClient();
  const [to, setTo] = useState(me.email);
  const status = useQuery({ queryKey: ["emails", "status"], queryFn: async () => (await api<EmailStatus>("/emails/status")).data });
  const log = useQuery({
    queryKey: ["emails", "log"],
    queryFn: async () => (await api<EmailRow[]>("/emails", { query: { page_size: 50 } })).data,
    // Emails send right after the request; poll briefly while any are still going out.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "queued") ? 2000 : false),
  });
  const test = useMutation({
    mutationFn: () => api<EmailRow>("/emails/test", { method: "POST", body: { to } }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      const msg = data.status === "logged" ? ["Test email logged (sending is off)", "Set EMAIL_PROVIDER=brevo in api/.env to send for real."]
        : data.status === "skipped" ? ["Not sent: that's a demo address", "Demo and test domains (like demo.com) are never emailed. Use a real address."]
        : [`Sending a test email to ${data.to_email}…`, "Watch its status in the list below."];
      toast.success(msg[0], { description: msg[1] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not send"),
  });
  const s = status.data;
  const used = s ? Math.min(100, (100 * s.sent_today) / s.daily_limit) : 0;
  const failed = log.data?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <>
      <PageHeader title="Email" description="Welcome emails, password resets and fee receipts sent by Vidyanexa." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {s?.sending ? <MailCheck className="size-5 text-success" aria-hidden /> : <Terminal className="size-5 text-muted-foreground" aria-hidden />}
              {s ? (s.sending ? "Sending through Brevo" : "Sending is off (development mode)") : "Email"}
            </CardTitle>
            <CardDescription>
              {s ? (s.sending ? `From ${s.sender} · ${s.provider === "brevo-smtp" ? "SMTP relay" : "API"}` : "Emails are written to the API log instead of being sent.") : "Loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!s && (
              <div aria-busy="true">
                <Skeleton className="mb-1 h-5" />
                <Skeleton className="h-2 rounded-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
              </div>
            )}
            {s && (
              <div>
                <div className="mb-1 flex justify-between text-sm"><span className="text-muted-foreground">Sent today</span><span className="font-semibold tabular">{s.sent_today} / {s.daily_limit}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-full rounded-full transition-[width] duration-700", used > 85 ? "bg-warning" : "bg-primary")} style={{ width: `${used}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Brevo&apos;s free plan allows {s.daily_limit} emails a day.</p>
              </div>
            )}
            {can("emails.manage") && (
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); test.mutate(); }}>
                <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send a test email to" className="sm:max-w-xs" required />
                <Button type="submit" loading={test.isPending} loadingText="Sending…"><Send aria-hidden />Send test email</Button>
              </form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>What gets emailed</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[["Welcome", "New accounts: email and temporary password"], ["Password reset", "From the “Forgot password” page"], ["Password set", "When the office sets a new password"], ["Fee receipt", "To parents after every payment"]].map(([k, v]) => (
                <li key={k}><span className="font-medium">{k}</span><span className="block text-xs text-muted-foreground">{v}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {failed > 0 && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {failed} recent email{failed > 1 ? "s" : ""} failed. The reason is shown below; &quot;Unauthorized IP address&quot; means the server&apos;s IP must be allowed in Brevo under Security → Authorised IPs.
        </p>
      )}

      <h2 className="mt-8 mb-3 font-heading text-lg font-bold">Recent emails</h2>
      {log.isLoading ? <Skeleton className="h-64 rounded-xl" /> : !log.data?.length ? (
        <EmptyState className="rounded-2xl border bg-card" title="No emails yet" description="They appear here as accounts are created, passwords reset and fees paid." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Recent emails</caption>
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {["To", "Email", "Type", "Status", "When"].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-left font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {log.data.map((r) => {
                const S = STATUS[r.status];
                return (
                  <tr key={r.id} className="align-top hover:bg-muted/30">
                    <td className="px-3 py-2.5"><span className="block font-medium">{r.to_name ?? r.to_email}</span>{r.to_name && <span className="block text-xs text-muted-foreground">{r.to_email}</span>}</td>
                    <td className="max-w-72 px-3 py-2.5"><span className="block truncate">{r.subject}</span>{r.error && <span className="block text-xs text-destructive">{r.error}</span>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{KIND[r.kind] ?? r.kind}</td>
                    <td className="px-3 py-2.5"><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", S.cls)}><S.icon className="size-3" aria-hidden />{S.label}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="emails.view"><EmailsPage /></PermissionGate>;
}
