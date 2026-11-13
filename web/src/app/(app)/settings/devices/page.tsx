"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Plus, Save, Server, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import type { BiometricDevice, Student } from "@/lib/api/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useClasses, useCurrentSchool, useDevices, usePunches, useStudents } from "@/lib/queries";
import { cn } from "@/lib/utils";

const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);

function AddDevice({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ serial_no: "", name: "", location: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ serial_no: "", name: "", location: "" }); setError(null); } }, [open]);
  const save = useMutation({
    mutationFn: () => api("/devices", { method: "POST", body: { ...f, location: f.location || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["devices"] }); toast.success("Device added. Point it at this server to start."); onOpenChange(false); },
    onError: (e) => setError(errText(e, "Could not add")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add an attendance machine</DialogTitle><DialogDescription>The serial number is on the back label or under Menu › System info.</DialogDescription></DialogHeader>
        <form id="dev-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Serial number" required>{(a) => <Input {...a} value={f.serial_no} onChange={(e) => setF((x) => ({ ...x, serial_no: e.target.value.trim() }))} placeholder="e.g. CQZ7231460123" className="font-mono" />}</Field>
          <Field label="Name" required>{(a) => <Input {...a} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Main gate" maxLength={100} />}</Field>
          <Field label="Where it is">{(a) => <Input {...a} value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} maxLength={100} />}</Field>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="dev-form" disabled={f.serial_no.length < 3 || !f.name.trim()} loading={save.isPending}>Add device</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Enrol() {
  const qc = useQueryClient();
  const classes = useClasses();
  const [sectionId, setSectionId] = useState("");
  const students = useStudents({ page: 1, page_size: 100, section_id: sectionId || undefined, status: "active" });
  const [pins, setPins] = useState<Record<string, string>>({});
  const rows = useMemo(() => (sectionId ? (students.data?.data ?? []) : []) as (Student & { biometric_id?: string | null })[], [students.data, sectionId]);
  useEffect(() => { setPins(Object.fromEntries(rows.map((s) => [s.id, s.biometric_id ?? ""]))); }, [rows]);
  const sections = classes.data?.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} – ${s.name}` }))) ?? [];
  const save = useMutation({
    mutationFn: () => api<{ updated: number }>("/devices/ids", { method: "PUT", body: { students: Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, v.trim() || null])) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["students"] }); toast.success("Numbers saved"); },
    onError: (e) => toast.error(errText(e, "Could not save")),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Fingerprint className="size-5 text-primary" aria-hidden />Enrolment numbers</CardTitle>
        <CardDescription>The number each student is enrolled under on the machine (its &quot;User ID&quot;). Punches from that number mark them present.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Class" className="w-64">
          {(a) => (
            <Select value={sectionId || undefined} onValueChange={(v) => setSectionId(String(v))}>
              <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Choose a section">{sections.find((s) => s.id === sectionId)?.label}</SelectValue></SelectTrigger>
              <SelectContent className="max-h-72">{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        {sectionId && (students.isLoading ? <Skeleton className="h-40" /> : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {rows.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{s.first_name} {s.last_name} <span className="text-xs text-muted-foreground">{s.admission_no}</span></span>
                  <Input value={pins[s.id] ?? ""} onChange={(e) => setPins((x) => ({ ...x, [s.id]: e.target.value.replace(/\D/g, "").slice(0, 30) }))}
                         inputMode="numeric" className="h-8 w-24 font-mono" aria-label={`Machine number for ${s.first_name} ${s.last_name}`} />
                </li>
              ))}
            </ul>
            <Button onClick={() => save.mutate()} loading={save.isPending}><Save aria-hidden />Save numbers</Button>
          </>
        ))}
      </CardContent>
    </Card>
  );
}

function LateCutoff() {
  const qc = useQueryClient();
  const school = useCurrentSchool();
  const [time, setTime] = useState("");
  useEffect(() => { setTime(String((school.data?.settings as Record<string, unknown> | undefined)?.late_after ?? "")); }, [school.data]);
  const save = useMutation({
    mutationFn: () => api("/schools/current", { method: "PATCH", body: { settings: { late_after: time || null } } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["school"] }); toast.success(time ? `Arrivals after ${time} are marked late` : "No late cut-off"); },
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Late after" hint="Scans and punches after this time count as late">{(a) => <Input {...a} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />}</Field>
      <Button variant="outline" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
    </div>
  );
}

function DevicesPage() {
  const qc = useQueryClient();
  const devices = useDevices();
  const punches = usePunches();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BiometricDevice | null>(null);
  const toggle = useMutation({
    mutationFn: (d: BiometricDevice) => api(`/devices/${d.id}`, { method: "PUT", body: { serial_no: d.serial_no, name: d.name, location: d.location, is_enabled: !d.is_enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["devices"] }); setRemoving(null); toast.success("Device removed"); },
  });
  const [host, setHost] = useState("");
  useEffect(() => setHost(window.location.hostname), []);
  return (
    <>
      <PageHeader title="Attendance machines" description="Fingerprint and face machines (ZKTeco and other ADMS devices) that mark attendance automatically."
        actions={<Button onClick={() => setAdding(true)}><Plus aria-hidden />Add device</Button>} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="size-5 text-primary" aria-hidden />Connecting a machine</CardTitle>
            <CardDescription>On the machine open Menu › Comm › Cloud server (ADMS) and set:</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Server address</dt><dd className="font-mono">{host || "your API server"}</dd>
              <dt className="text-muted-foreground">Port</dt><dd className="font-mono">8000 (or 443 with HTTPS)</dd>
              <dt className="text-muted-foreground">Proxy</dt><dd>Off</dd>
            </dl>
            <LateCutoff />
          </CardContent>
        </Card>
        {devices.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !devices.data?.length ? (
          <EmptyState className="rounded-2xl border bg-card" illustration={<Fingerprint className="size-12 text-muted-foreground/60" aria-hidden />} title="No machines yet"
            description="Add each machine by its serial number before pointing it at the server." action={<Button onClick={() => setAdding(true)}><Plus aria-hidden />Add device</Button>} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {devices.data.map((d) => (
              <li key={d.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("flex size-10 items-center justify-center rounded-lg", d.online ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                    {d.online ? <Wifi className="size-5" aria-hidden /> : <WifiOff className="size-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{d.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{d.serial_no}{d.location ? ` · ${d.location}` : ""}</p>
                    <p className="mt-1 text-xs">{d.online ? <span className="font-medium text-success">Online</span> : d.last_seen ? `Last seen ${timeAgo(d.last_seen)}` : "Never connected"} · {d.punches} punches</p>
                  </div>
                  <Switch checked={d.is_enabled} onCheckedChange={() => toggle.mutate(d)} aria-label={`Accept punches from ${d.name}`} />
                  <Button variant="ghost" size="icon" aria-label={`Remove ${d.name}`} onClick={() => setRemoving(d)}><Trash2 aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Enrol />
        <Card>
          <CardHeader><CardTitle>Latest punches</CardTitle><CardDescription>Unknown numbers aren&apos;t enrolled to anyone yet.</CardDescription></CardHeader>
          <CardContent>
            {!punches.data?.length ? <p className="text-sm text-muted-foreground">No punches yet.</p> : (
              <ul className="divide-y text-sm">
                {punches.data.slice(0, 30).map((p, i) => (
                  <li key={i} className="flex flex-wrap gap-x-4 py-1.5">
                    <span className="w-40 text-muted-foreground">{formatDateTime(p.punched_at)}</span>
                    <span className="w-16 font-mono">{p.pin}</span>
                    <span className={cn("flex-1", !p.matched && "text-warning")}>{p.matched ?? "Unknown number"}</span>
                    <span className="text-xs text-muted-foreground">{p.device}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AddDevice open={adding} onOpenChange={setAdding} />
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} destructive pending={remove.isPending}
        title={`Remove ${removing?.name}?`} description="Its punches stay in attendance; new punches from it are refused." confirmLabel="Remove"
        onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}

/** Biometric machines (ADMS) aren't offered to schools until they have been tested with real devices. */
const DEVICES_READY = false;

export default function Page() {
  if (!DEVICES_READY) {
    return (
      <>
        <PageHeader title="Attendance machines" />
        <EmptyState className="rounded-2xl border bg-card" title="Coming soon"
          description="Fingerprint and face attendance machines aren't available yet. Teachers take attendance in the app or on the website, and students can scan their QR ID cards." />
      </>
    );
  }
  return <PermissionGate permission="devices.manage"><DevicesPage /></PermissionGate>;
}
