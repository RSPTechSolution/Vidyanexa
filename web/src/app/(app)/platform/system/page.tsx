"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CheckCircle2, DatabaseBackup, FileDown, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";

type Check = { ok?: boolean; [k: string]: unknown };
type Health = {
  status: string; environment: string; uptime_s: number | null; checked_at: string; database: Check; redis: Check; storage: Check; backups: Check;
  providers: Record<string, string>; usage: Record<string, number>;
};
type Backup = { name: string; size: number; created_at: string | null; revision: string | null; row_total: number | null; note: string | null };
type Settings = { product_name: string; support_email: string | null; support_phone: string | null; banner: { text: string; tone: string; until: string | null } };

const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const LABELS: Record<string, string> = { database: "Database", redis: "Redis (cache and limits)", storage: "File storage", backups: "Backups" };

function HealthTab() {
  const q = useQuery({ queryKey: ["platform", "health"], refetchInterval: 30_000, queryFn: async () => (await api<Health>("/platform/health")).data });
  const h = q.data;
  if (!h) return <Skeleton className="h-64 rounded-2xl" />;
  const detail = (k: string, c: Check) => Object.entries(c).filter(([x]) => x !== "ok").map(([x, v]) => `${x.replace(/_/g, " ")}: ${v ?? "—"}`).join(" · ") || (k === "backups" ? "No backups yet" : "");
  return (
    <div className="space-y-5">
      <div className={cn("flex items-center gap-3 rounded-2xl border p-4", h.status === "ok" ? "border-success/40 bg-success/5" : "border-warning/50 bg-warning/5")}>
        {h.status === "ok" ? <CheckCircle2 className="size-6 text-success" aria-hidden /> : <XCircle className="size-6 text-warning" aria-hidden />}
        <div className="flex-1">
          <p className="font-semibold">{h.status === "ok" ? "Everything is working" : "Something needs attention"}</p>
          <p className="text-sm text-muted-foreground">{h.environment} · up {h.uptime_s != null ? `${Math.floor(h.uptime_s / 3600)}h ${Math.floor((h.uptime_s % 3600) / 60)}m` : "—"} · checked {format(parseISO(h.checked_at), "h:mm:ss a")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} loading={q.isFetching}><RefreshCw aria-hidden />Check now</Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {(["database", "redis", "storage", "backups"] as const).map((k) => (
          <li key={k} className="flex gap-3 rounded-xl border bg-card p-4">
            {h[k].ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-label="Problem" />}
            <div><p className="font-medium">{LABELS[k]}</p><p className="text-sm text-muted-foreground">{detail(k, h[k])}</p></div>
          </li>
        ))}
      </ul>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 font-semibold">Services</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">{Object.entries(h.providers).map(([k, v]) => <div key={k} className="contents"><dt className="capitalize text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
          <p className="mt-3 text-xs text-muted-foreground">&quot;console&quot; means messages are logged, not sent. Set the provider keys in the server settings to go live.</p>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 font-semibold">Usage</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">{Object.entries(h.usage).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k.replace("_24h", " (24h)").replace(/_/g, " ")}</dt><dd className="font-medium tabular">{v.toLocaleString("en-IN")}</dd></div>)}</dl>
        </section>
        <TestSends />
      </div>
    </div>
  );
}

/** Check the email and SMS/WhatsApp services by sending yourself a message (schools don't see this). */
function TestSends() {
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const email = useMutation({
    mutationFn: () => api<{ status: string; to_email: string }>("/emails/test", { method: "POST", body: { to } }),
    onSuccess: ({ data }) => toast.success(
      data.status === "logged" ? "Logged only: email sending is off on this server"
        : data.status === "skipped" ? "Not sent: demo and test domains are never emailed"
        : `Sending a test email to ${data.to_email}`),
    onError: (e) => toast.error(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not send"),
  });
  const text = useMutation({
    mutationFn: () => api<{ message: string }>("/messaging/test", { method: "POST", body: { channel, phone } }),
    onSuccess: ({ data }) => toast.success(data.message),
    onError: (e) => toast.error(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not send"),
  });
  return (
    <section className="rounded-2xl border bg-card p-5 md:col-span-2">
      <h2 className="font-semibold">Test sends</h2>
      <p className="mb-4 text-sm text-muted-foreground">Send yourself an email or a text to check the services above. Only you see this; schools don&apos;t.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); email.mutate(); }}>
          <Field label="Email address" className="min-w-0 flex-1">{(a) => <Input {...a} type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />}</Field>
          <Button type="submit" variant="outline" loading={email.isPending}>Send test email</Button>
        </form>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); text.mutate(); }}>
          <Field label="Channel" className="w-32">{(a) => (
            <Select value={channel} onValueChange={(v) => setChannel(v as "sms" | "whatsapp")}>
              <SelectTrigger id={a.id} className="w-full"><SelectValue>{channel === "sms" ? "SMS" : "WhatsApp"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent>
            </Select>
          )}</Field>
          <Field label="Mobile number" className="min-w-0 flex-1">{(a) => <Input {...a} type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98140 10001" />}</Field>
          <Button type="submit" variant="outline" disabled={phone.trim().length < 6} loading={text.isPending}>Send test</Button>
        </form>
      </div>
    </section>
  );
}

function BackupsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform", "backups"], queryFn: async () => (await api<Backup[]>("/platform/backups")).data });
  const [removing, setRemoving] = useState<string | null>(null);
  const make = useMutation({
    mutationFn: async () => (await api<Backup>("/platform/backups", { method: "POST" })).data,
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ["platform"] }); toast.success(`Backup made: ${b.row_total?.toLocaleString("en-IN")} rows`); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Backup failed"),
  });
  const del = useMutation({
    mutationFn: (name: string) => api(`/platform/backups/${name}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform"] }); setRemoving(null); toast.success("Backup deleted"); },
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => make.mutate()} loading={make.isPending}><DatabaseBackup aria-hidden />Back up now</Button>
        <p className="text-sm text-muted-foreground">Every table, in one zip. Restore on the server with <code className="rounded bg-muted px-1">python -m app.restore &lt;file&gt; --yes</code>.</p>
      </div>
      {q.isLoading ? <Skeleton className="h-40 rounded-xl" /> : !q.data?.length ? <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">No backups yet.</p> : (
        <ul className="divide-y rounded-2xl border bg-card">
          {q.data.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.created_at ? format(parseISO(b.created_at), "d MMM yyyy, h:mm a") : "—"} · {mb(b.size)} · {b.row_total?.toLocaleString("en-IN") ?? "?"} rows · schema {b.revision} · {b.note}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => downloadFile(`/platform/backups/${b.name}`, b.name).catch((e) => toast.error(e.message))}><FileDown aria-hidden />Download</Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${b.name}`} onClick={() => setRemoving(b.name)}><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} title="Delete this backup?" description={removing}
        confirmLabel="Delete" destructive pending={del.isPending} onConfirm={() => removing && del.mutate(removing)} />
    </>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform", "settings"], queryFn: async () => (await api<Settings>("/platform/settings")).data });
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api("/platform/settings", { method: "PUT", body: {
      ...f, support_email: f!.support_email || null, support_phone: f!.support_phone || null,
      banner: { ...f!.banner, until: f!.banner.until ? new Date(f!.banner.until).toISOString() : null },
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not save"),
  });
  if (!f) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <form className="grid max-w-2xl gap-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Support contacts</h2>
        <Field label="Product name">{(a) => <Input {...a} value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} />}</Field>
        <Field label="Support email">{(a) => <Input {...a} type="email" value={f.support_email ?? ""} onChange={(e) => setF({ ...f, support_email: e.target.value })} />}</Field>
        <Field label="Support phone">{(a) => <Input {...a} type="tel" value={f.support_phone ?? ""} onChange={(e) => setF({ ...f, support_phone: e.target.value })} />}</Field>
      </section>
      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Announcement banner</h2>
        <p className="-mt-2 text-sm text-muted-foreground sm:col-span-2">Shown at the top of every school&apos;s app, for example before planned maintenance. Leave empty for none.</p>
        <Field label="Message" className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} maxLength={300} value={f.banner.text} onChange={(e) => setF({ ...f, banner: { ...f.banner, text: e.target.value } })} />}</Field>
        <Field label="Style">
          {(a) => (
            <Select value={f.banner.tone} onValueChange={(v) => setF({ ...f, banner: { ...f.banner, tone: String(v) } })}>
              <SelectTrigger id={a.id} className="w-full"><SelectValue>{{ info: "Information", warning: "Warning", danger: "Urgent" }[f.banner.tone]}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="info">Information</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="danger">Urgent</SelectItem></SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Hide after" hint="Optional">{(a) => <Input {...a} type="datetime-local" value={f.banner.until ? format(parseISO(f.banner.until), "yyyy-MM-dd'T'HH:mm") : ""}
          onChange={(e) => setF({ ...f, banner: { ...f.banner, until: e.target.value ? new Date(e.target.value).toISOString() : null } })} />}</Field>
      </section>
      <div><Button type="submit" loading={save.isPending}><Save aria-hidden />Save</Button></div>
    </form>
  );
}

function SystemPage() {
  const [tab, setTab] = useState("health");
  return (
    <>
      <PageHeader title="System" description="Health of the platform, database backups, and platform-wide settings." />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="mb-5">
        <TabsList><TabsTrigger value="health">Health</TabsTrigger><TabsTrigger value="backups">Backups</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
      </Tabs>
      {tab === "health" && <HealthTab />}
      {tab === "backups" && <BackupsTab />}
      {tab === "settings" && <SettingsTab />}
    </>
  );
}

export default function Page() {
  return <PermissionGate superAdmin><SystemPage /></PermissionGate>;
}
