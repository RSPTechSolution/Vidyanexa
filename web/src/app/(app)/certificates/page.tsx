"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Ban, CheckCircle2, FileBadge2, IdCard, Plus, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Chip, StudentPicker } from "@/components/academics/pickers";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api/client";
import type { Certificate, Clearance, Due, StudentOption } from "@/lib/api/types";
import { postDownload } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { useCertificates, useClasses } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Kind = Certificate["kind"];
const KINDS: Record<Kind, { label: string; hint: string }> = {
  bonafide: { label: "Bonafide", hint: "Confirms the child studies here, e.g. for a bank account or passport." },
  character: { label: "Character", hint: "Speaks to the student's conduct." },
  transfer: { label: "Transfer (TC)", hint: "For a student leaving the school. Only one valid TC per student." },
};

function IssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [kind, setKind] = useState<Kind>("bonafide");
  const [f, setF] = useState({ purpose: "", conduct: "Good", leaving_date: format(new Date(), "yyyy-MM-dd"), reason: "", last_class: "", promoted: "yes", fees_paid_upto: "", remarks: "" });
  const [error, setError] = useState<string | null>(null);
  // Dues the office has seen and chosen to go ahead with.
  const [ignoreDues, setIgnoreDues] = useState(false);
  // After a TC: ask whether the student leaves now.
  const [leaving, setLeaving] = useState<Certificate | null>(null);
  useEffect(() => { if (open) { setStudent(null); setError(null); setIgnoreDues(false); } }, [open]);
  useEffect(() => { setIgnoreDues(false); }, [student]);
  // Every certificate first checks what the student still owes: fees, library books and fines, a hostel bed, a bus seat.
  const clearance = useQuery({
    queryKey: ["certificates", "clearance", student?.id],
    enabled: Boolean(student),
    queryFn: async () => (await api<Clearance>(`/certificates/clearance/${student!.id}`)).data,
  });
  const dues = clearance.data?.dues ?? [];
  const blocked = !student || clearance.isLoading || (dues.length > 0 && !ignoreDues);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const issue = useMutation({
    mutationFn: () => {
      const pick = kind === "bonafide" ? ["purpose", "remarks"] : kind === "character" ? ["conduct", "remarks"]
        : ["leaving_date", "reason", "last_class", "promoted", "fees_paid_upto", "conduct", "remarks"];
      const body: Record<string, unknown> = { student_id: student!.id, kind, ignore_dues: ignoreDues };
      for (const k of pick) if (f[k as keyof typeof f]) body[k] = f[k as keyof typeof f];
      return api<Certificate>("/certificates", { method: "POST", body });
    },
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`${data.serial_no} issued to ${data.student_name}`, {
        action: { label: "Open PDF", onClick: () => window.open(`/api/proxy/certificates/${data.id}/pdf`, "_blank") },
      });
      onOpenChange(false);
      if (data.kind === "transfer") setLeaving(data);
    },
    onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Could not issue"),
  });
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Issue a certificate</DialogTitle><DialogDescription>{KINDS[kind].hint}</DialogDescription></DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-0.5">
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList>{(Object.keys(KINDS) as Kind[]).map((k) => <TabsTrigger key={k} value={k}>{KINDS[k].label}</TabsTrigger>)}</TabsList>
          </Tabs>
          <div>
            <p className="mb-1.5 text-sm font-medium">Student<span className="text-destructive" aria-hidden>*</span></p>
            {student ? <Chip label={`Remove ${student.name}`} onRemove={() => setStudent(null)}>{student.name} · {student.class_section}</Chip> : <StudentPicker onPick={setStudent} />}
          </div>
          <form id="cert-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}>
            {kind === "bonafide" && <Field label="Purpose" required className="sm:col-span-2">{(a) => <Input {...a} value={f.purpose} onChange={set("purpose")} placeholder="e.g. Opening a bank account" maxLength={100} />}</Field>}
            {kind !== "bonafide" && <Field label="Conduct">{(a) => <Input {...a} value={f.conduct} onChange={set("conduct")} maxLength={100} />}</Field>}
            {kind === "transfer" && (
              <>
                <Field label="Date of leaving" required>{(a) => <Input {...a} type="date" value={f.leaving_date} onChange={set("leaving_date")} />}</Field>
                <Field label="Reason for leaving" required className="sm:col-span-2">{(a) => <Input {...a} value={f.reason} onChange={set("reason")} placeholder="e.g. Family moving to another city" maxLength={100} />}</Field>
                <Field label="Class at leaving" hint="Leave blank to use the current class">{(a) => <Input {...a} value={f.last_class} onChange={set("last_class")} maxLength={100} />}</Field>
                <Field label="Promoted to the next class">
                  {(a) => (
                    <Select value={f.promoted} onValueChange={(v) => setF((x) => ({ ...x, promoted: String(v) }))}>
                      <SelectTrigger id={a.id} className="w-full"><SelectValue>{{ yes: "Yes", no: "No", na: "Not applicable" }[f.promoted]}</SelectValue></SelectTrigger>
                      <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem><SelectItem value="na">Not applicable</SelectItem></SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Fees paid up to">{(a) => <Input {...a} value={f.fees_paid_upto} onChange={set("fees_paid_upto")} placeholder="e.g. September 2026" maxLength={100} />}</Field>
              </>
            )}
            <Field label="Remarks" className="sm:col-span-2">{(a) => <Input {...a} value={f.remarks} onChange={set("remarks")} maxLength={500} placeholder="Optional" />}</Field>
          </form>
        </div>
        {student && <DuesPanel loading={clearance.isLoading} dues={dues} ignore={ignoreDues} onIgnore={setIgnoreDues} />}
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="cert-form" disabled={blocked} loading={issue.isPending} loadingText="Issuing…">Issue certificate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <MarkLeftDialog certificate={leaving} onDone={() => setLeaving(null)} />
    </>
  );
}

/** What the student still owes, shown before any certificate; issuing needs the office to say it's going ahead. */
function DuesPanel({ loading, dues, ignore, onIgnore }: { loading: boolean; dues: Due[]; ignore: boolean; onIgnore: (v: boolean) => void }) {
  if (loading) return <p className="text-sm text-muted-foreground">Checking fees, library, hostel and transport…</p>;
  if (!dues.length) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />No dues: fees, library, hostel and transport are all clear.
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />This student still has dues</p>
      <ul className="mt-2 space-y-1">
        {dues.map((d) => <li key={d.area}><span className="font-medium">{d.label}:</span> {d.detail}</li>)}
      </ul>
      <label className="mt-3 flex items-start gap-2">
        <Checkbox checked={ignore} onCheckedChange={(v) => onIgnore(Boolean(v))} className="mt-0.5" />
        <span>Issue anyway. The dues stay on the student&apos;s record.</span>
      </label>
    </div>
  );
}

/** Asked straight after a transfer certificate: does the student leave now? */
function MarkLeftDialog({ certificate, onDone }: { certificate: Certificate | null; onDone: () => void }) {
  const qc = useQueryClient();
  const left = useMutation({
    mutationFn: (id: string) => api(`/certificates/${id}/mark-left`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["certificates"] });
      toast.success(`${certificate?.student_name} is marked as left`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the student"),
  });
  return (
    <ConfirmDialog
      open={Boolean(certificate)}
      onOpenChange={(o) => !o && onDone()}
      title={`Mark ${certificate?.student_name ?? "the student"} as left?`}
      description="They become inactive and their seat is freed. Their hostel bed and bus seat are given up, and the family no longer sees them in the app. Their records and certificates are kept."
      confirmLabel="Mark as left"
      cancelLabel="Not now"
      pending={left.isPending}
      onConfirm={() => certificate && left.mutate(certificate.id)}
    />
  );
}

function IdCards() {
  const classes = useClasses();
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const sections = classes.data?.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} – ${s.name}`, n: s.student_count }))) ?? [];
  const picked = sections.find((s) => s.id === sectionId);
  async function download() {
    setBusy(true);
    try {
      await postDownload("/certificates/id-cards", { section_id: sectionId }, "id-cards.pdf");
      toast.success("ID cards downloaded", { description: "Ten cards to an A4 page. Print on card stock and cut along the borders." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the ID cards");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><IdCard className="size-5 text-primary" aria-hidden />Student ID cards</CardTitle>
        <CardDescription>With photo, class, blood group, parent&apos;s phone and a QR code of the admission number.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Class" className="sm:w-64">
          {(a) => (
            <Select value={sectionId || undefined} onValueChange={(v) => setSectionId(String(v))}>
              <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Choose a section">{picked?.label}</SelectValue></SelectTrigger>
              <SelectContent className="max-h-72">{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label} ({s.n})</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Button onClick={download} disabled={!sectionId} loading={busy} loadingText="Creating…"><IdCard aria-hidden />Download ID cards</Button>
      </CardContent>
    </Card>
  );
}

export default function CertificatesPage() {
  const qc = useQueryClient();
  const q = useCertificates();
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState<Certificate | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/certificates/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["certificates"] }); setCancelling(null); toast.success("Certificate cancelled"); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not cancel"),
  });
  return (
    <PermissionGate permission="certificates.manage">
      <PageHeader title="Certificates & ID cards" description="Issue transfer, bonafide and character certificates with serial numbers, and print ID cards."
        actions={<Button onClick={() => setIssuing(true)}><Plus aria-hidden />Issue certificate</Button>} />
      <div className="space-y-6">
        <IdCards />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="size-5 text-primary" aria-hidden />Issued certificates</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-40" /> : !q.data?.length ? (
              <EmptyState className="py-8" title="No certificates yet" action={<Button onClick={() => setIssuing(true)}><FileBadge2 aria-hidden />Issue the first one</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Serial no.</th><th scope="col" className="py-2 pr-3 font-medium">Student</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Type</th><th scope="col" className="py-2 pr-3 font-medium">Issued</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody>
                    {q.data.map((c) => (
                      <tr key={c.id} className={cn("border-b last:border-0", c.cancelled && "text-muted-foreground")}>
                        <td className="py-2.5 pr-3 font-mono text-xs">{c.serial_no}{c.cancelled && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-destructive">Cancelled</span>}</td>
                        <td className="py-2.5 pr-3"><span className="font-medium">{c.student_name}</span><span className="block text-xs text-muted-foreground">{c.admission_no} · {c.class_section}</span></td>
                        <td className="py-2.5 pr-3">{KINDS[c.kind].label}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(c.issued_on)}<span className="block text-xs text-muted-foreground">{c.issued_by}</span></td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <Button variant="outline" size="sm" render={<a href={`/api/proxy/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer" />}>Open PDF</Button>
                          {!c.cancelled && <Button variant="ghost" size="icon" aria-label={`Cancel ${c.serial_no}`} onClick={() => setCancelling(c)}><Ban aria-hidden /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <IssueDialog open={issuing} onOpenChange={setIssuing} />
      <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(o) => !o && setCancelling(null)} destructive pending={cancel.isPending}
        title={`Cancel ${cancelling?.serial_no}?`} description="The PDF is stamped “cancelled” and families can no longer open it. The serial number is not reused."
        confirmLabel="Cancel certificate" onConfirm={() => cancelling && cancel.mutate(cancelling.id)} />
    </PermissionGate>
  );
}
