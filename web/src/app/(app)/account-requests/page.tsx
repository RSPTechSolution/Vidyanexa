"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Plus, UserMinus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import { timeAgo } from "@/lib/format";
import { useMyAttendance } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface AccountRequest {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  students: string[];
  requested_by_name: string;
  requested_by_email: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

const STATUS: Record<string, string> = {
  pending: "bg-warning/10 text-warning", approved: "bg-success/10 text-success", rejected: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground",
};
const LABEL: Record<string, string> = { pending: "Waiting for the school", approved: "Accounts closed", rejected: "Declined", cancelled: "Withdrawn" };
const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);

function useRequests(status: string) {
  return useQuery({
    queryKey: ["account-requests", status],
    queryFn: async () => (await api<AccountRequest[]>("/account-requests", { query: status ? { status } : undefined })).data,
  });
}

/** A parent (or student) asking the school to close their accounts, because the child is moving school. */
function RequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useSession();
  const qc = useQueryClient();
  const kids = useMyAttendance(format(new Date(), "yyyy-MM"), open);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setError(null); setReason(""); setChosen([]); } }, [open]);
  useEffect(() => { if (open && kids.data?.length === 1) setChosen([kids.data[0].student_id]); }, [open, kids.data]);
  const parent = me.role === "parent";
  const save = useMutation({
    mutationFn: () => api("/account-requests", { method: "POST", body: { student_ids: chosen, reason } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["account-requests"] }); toast.success("Request sent to the school office"); onOpenChange(false); },
    onError: (e) => setError(errText(e, "Could not send the request")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Leaving the school</DialogTitle>
          <DialogDescription>
            Ask the school to close your accounts. Once it approves, the logins stop working and your email is free for the
            new school to add you. The school keeps the records (for certificates and history).
          </DialogDescription>
        </DialogHeader>
        <form id="leaving-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {parent && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Which children are leaving?</legend>
              {kids.data?.map((k) => (
                <label key={k.student_id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
                  <Checkbox checked={chosen.includes(k.student_id)}
                    onCheckedChange={(c) => setChosen((x) => (c ? [...x, k.student_id] : x.filter((y) => y !== k.student_id)))} />
                  <span className="font-medium">{k.name}</span><span className="text-muted-foreground">{k.class_section}</span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Your own login closes once none of your children are at the school.</p>
            </fieldset>
          )}
          <Field label="Reason" required>
            {(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. We're moving to Pune; joining a new school from April" />}
          </Field>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="leaving-form" disabled={(parent && !chosen.length) || reason.trim().length < 3} loading={save.isPending}>Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ r, family }: { r: AccountRequest; family: boolean }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const done = () => qc.invalidateQueries({ queryKey: ["account-requests"] });
  const decide = useMutation({
    mutationFn: (approve: boolean) => api(`/account-requests/${r.id}/decide`, { method: "POST", body: { approve, note: note || null } }),
    onSuccess: (_, approve) => { done(); toast.success(approve ? "Accounts closed. The family has been emailed." : "Declined"); },
    onError: (e) => toast.error(errText(e, "Could not save")),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/account-requests/${r.id}/cancel`, { method: "POST" }),
    onSuccess: () => { done(); toast.success("Request withdrawn"); },
    onError: (e) => toast.error(errText(e, "Could not withdraw")),
  });
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{r.students.join(", ")}</p>
        <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[r.status])}>{LABEL[r.status] ?? r.status}</span>
      </div>
      {!family && <p className="mt-0.5 text-sm text-muted-foreground">Asked by {r.requested_by_name}{r.requested_by_email ? ` · ${r.requested_by_email}` : ""}</p>}
      <p className="mt-2 text-sm whitespace-pre-line">{r.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">{timeAgo(r.created_at)}{r.decision_note ? ` · School: “${r.decision_note}”` : ""}</p>
      {!family && r.status === "pending" && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Approving marks {r.students.length === 1 ? "this student" : "these students"} as left and closes their logins, and the parent&apos;s once no child is still here.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the family (optional)" aria-label="Note to the family" maxLength={300} />
            <div className="flex gap-2">
              <Button onClick={() => decide.mutate(true)} loading={decide.isPending && decide.variables}><Check aria-hidden />Approve</Button>
              <Button variant="outline" onClick={() => decide.mutate(false)} loading={decide.isPending && !decide.variables}><X aria-hidden />Decline</Button>
            </div>
          </div>
        </div>
      )}
      {family && r.status === "pending" && <Button variant="ghost" size="sm" className="mt-2" onClick={() => cancel.mutate()} loading={cancel.isPending}>Withdraw request</Button>}
    </li>
  );
}

export default function AccountRequestsPage() {
  const me = useSession();
  const family = me.role === "parent" || me.role === "student";
  const [status, setStatus] = useState(family ? "" : "pending");
  const q = useRequests(status);
  const [asking, setAsking] = useState(false);
  const waiting = family && q.data?.some((r) => r.status === "pending");
  const ask = family && !waiting && <Button onClick={() => setAsking(true)}><Plus aria-hidden />Request account closure</Button>;
  return (
    <>
      <PageHeader title={family ? "Leaving the school" : "Leaving requests"}
        description={family ? "Moving to another school? Ask this school to close your accounts, so the new school can add you with the same email."
          : "Families asking to close their accounts because a child is leaving. Approving frees their email for the new school."}
        actions={ask || undefined} />
      {!family && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {[["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Declined"], ["", "All"]].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}
              className={cn("rounded-full border px-3 py-1 text-sm transition", status === v ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>{label}</button>
          ))}
        </div>
      )}
      {q.isLoading ? <Skeleton className="h-40 rounded-xl" /> : !q.data?.length ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<UserMinus className="size-12 text-muted-foreground/60" aria-hidden />}
          title={family ? "No requests" : status === "pending" ? "Nothing waiting" : "No requests"}
          description={family ? "Only needed when your child is moving to another school." : undefined}
          action={ask || undefined} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">{q.data.map((r) => <RequestCard key={r.id} r={r} family={family} />)}</ul>
      )}
      {family && <RequestDialog open={asking} onOpenChange={setAsking} />}
    </>
  );
}
