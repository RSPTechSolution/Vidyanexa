"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, MessageCircle, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { useCan } from "@/components/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useMessageLog, useMessagingStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** The school chooses which events text parents. Which SMS/WhatsApp service sends them, and test sends, are the
 *  platform's business (Platform → System), so none of that is shown here. */
function MessagingPage() {
  const can = useCan();
  const manage = can("emails.manage");
  const qc = useQueryClient();
  const st = useMessagingStatus();
  const log = useMessageLog();
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  useEffect(() => { if (st.data) setChosen(st.data.chosen); }, [st.data]);
  const save = useMutation({
    mutationFn: () => api("/messaging/settings", { method: "PUT", body: { events: chosen } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messaging"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });
  if (st.isLoading || !st.data) return <Skeleton className="h-96 rounded-2xl" />;
  const s = st.data;
  const toggle = (ev: string, ch: string, on: boolean) => setChosen((x) => ({ ...x, [ev]: on ? [...(x[ev] ?? []), ch] : (x[ev] ?? []).filter((c) => c !== ch) }));
  const offline = s.sms_provider === "console" && s.whatsapp_provider === "console";
  return (
    <>
      <PageHeader title="SMS and WhatsApp" description="Text parents for the things that matter most. App notifications and email go out anyway." />
      {offline && (
        <Alert className="mb-5"><Info aria-hidden /><AlertDescription>
          Text messages aren&apos;t switched on for Vidyanexa yet. Choose the events below now; parents start getting texts as soon as they are.
        </AlertDescription></Alert>
      )}
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>When to text parents</CardTitle>
          <CardDescription>Sent today: {s.today.sms ?? 0} SMS · {s.today.whatsapp ?? 0} WhatsApp</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <caption className="sr-only">Which events text parents, by SMS and WhatsApp</caption>
            <thead><tr className="text-left text-xs text-muted-foreground"><th scope="col" className="pb-2">Event</th><th scope="col" className="w-24 pb-2 text-center">SMS</th><th scope="col" className="w-24 pb-2 text-center">WhatsApp</th></tr></thead>
            <tbody>
              {Object.entries(s.events).map(([ev, label]) => (
                <tr key={ev} className="border-t">
                  <td className="py-2.5">{label}</td>
                  {(["sms", "whatsapp"] as const).map((ch) => (
                    <td key={ch} className="py-2.5 text-center"><Switch checked={(chosen[ev] ?? []).includes(ch)} disabled={!manage} onCheckedChange={(v) => toggle(ev, ch, v)} aria-label={`${label} by ${ch === "sms" ? "SMS" : "WhatsApp"}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {manage && <Button className="mt-4" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>Recent messages</CardTitle></CardHeader>
        <CardContent>
          {!log.data?.length ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
            <ul className="divide-y text-sm">
              {log.data.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2">
                  {m.channel === "sms" ? <Smartphone className="mt-0.5 size-4 text-muted-foreground" aria-label="SMS" /> : <MessageCircle className="mt-0.5 size-4 text-success" aria-label="WhatsApp" />}
                  <span className="w-36 font-mono text-xs">{m.to}</span>
                  <span className="min-w-0 flex-1">{m.body}{m.error && <span className="block text-xs text-destructive">{m.error}</span>}</span>
                  <span className={cn("text-xs font-medium capitalize", m.status === "failed" ? "text-destructive" : m.status === "sent" ? "text-success" : "text-muted-foreground")}>{m.status === "logged" ? "Not sent" : m.status}</span>
                  <span className="w-36 text-right text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="emails.view"><MessagingPage /></PermissionGate>;
}
