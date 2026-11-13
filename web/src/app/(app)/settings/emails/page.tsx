"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, MailX, Terminal } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EmailRow { id: string; to_email: string; to_name: string | null; subject: string; kind: string; status: "queued" | "sent" | "failed" | "logged" | "skipped"; error: string | null; created_at: string; sent_at: string | null }

const KIND: Record<string, string> = {
  welcome: "Welcome", password_reset: "Password reset", password_set: "Password set", password_changed: "Password changed",
  account_closure: "Account closed", login_code: "Sign-in code", fee_receipt: "Fee receipt", fee_reminder: "Fee reminder",
};
/** "gate_pass" → "Gate pass", for any kind not named above. */
const kindLabel = (k: string) => KIND[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");
const STATUS = {
  sent: { label: "Sent", cls: "bg-success/12 text-success", icon: CheckCircle2 },
  queued: { label: "Sending…", cls: "bg-info/12 text-info", icon: Clock },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: MailX },
  logged: { label: "Logged only", cls: "bg-muted text-muted-foreground", icon: Terminal },
  skipped: { label: "Skipped (demo address)", cls: "bg-muted text-muted-foreground", icon: MailX },
} as const;

function EmailsPage() {
  const log = useQuery({
    queryKey: ["emails", "log"],
    queryFn: async () => (await api<EmailRow[]>("/emails", { query: { page_size: 50 } })).data,
    // Emails send right after the request; poll briefly while any are still going out.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "queued") ? 2000 : false),
  });
  const failed = log.data?.filter((r) => r.status === "failed").length ?? 0;

  // The school's own record of what was emailed. Which service sends the email, its limits and test sends are the
  // platform's business (Platform → System), not the school's.
  return (
    <>
      <PageHeader title="Email" description="What Vidyanexa emails on your school's behalf, and to whom." />
      <Card>
        <CardHeader><CardTitle>What gets emailed</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[["Welcome", "New accounts: email and temporary password"], ["Password reset", "From the “Forgot password” page"], ["Password set", "When the office sets a new password"], ["Fee receipt", "To parents after every payment"]].map(([k, v]) => (
              <li key={k}><span className="font-medium">{k}</span><span className="block text-xs text-muted-foreground">{v}</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {failed > 0 && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {failed} recent email{failed > 1 ? "s" : ""} couldn&apos;t be delivered. Check the address on the person&apos;s account; if it&apos;s right, contact Vidyanexa support.
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
                    <td className="px-3 py-2.5 text-muted-foreground">{kindLabel(r.kind)}</td>
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
