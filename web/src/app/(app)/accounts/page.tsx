"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Banknote, FileDown, Landmark, Paperclip, Pencil, Plus, Scale, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { LoadMore, useLoadMore } from "@/components/common/load-more";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { FileList } from "@/components/common/files";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatCard } from "@/components/common/stat-card";
import { BarList, BarListSkeleton } from "@/components/dashboard/bar-list";
import { IncomeExpenseChart } from "@/components/dashboard/lazy-charts";
import { useCan } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api/client";
import type { AccountEntry, LedgerHead } from "@/lib/api/types";
import { downloadFile } from "@/lib/download";
import { formatDate, inr } from "@/lib/format";
import { useAccountEntries, useAccountsSummary, useLedgerHeads } from "@/lib/queries";
import { cn } from "@/lib/utils";

const METHODS: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", upi: "UPI", cheque: "Cheque", card: "Card" };
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);

function yearStart(d = new Date()) {
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}
const RANGES = {
  month: { label: "This month", from: () => startOfMonth(new Date()), to: () => new Date() },
  last: { label: "Last month", from: () => startOfMonth(subMonths(new Date(), 1)), to: () => endOfMonth(subMonths(new Date(), 1)) },
  year: { label: "This academic year", from: () => yearStart(), to: () => new Date() },
} as const;
type RangeKey = keyof typeof RANGES;

function EntryDialog({ entry, kind, heads, open, onOpenChange }: {
  entry: AccountEntry | null; kind: "income" | "expense"; heads: LedgerHead[]; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const blank = { head_id: "", date: iso(new Date()), amount: "", party: "", method: "cash", reference: "", note: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const k = entry?.kind ?? kind;
  useEffect(() => {
    if (!open) return;
    setF(entry ? { head_id: entry.head_id, date: entry.date, amount: String(entry.amount), party: entry.party ?? "", method: entry.method,
                   reference: entry.reference ?? "", note: entry.note ?? "" } : blank);
    setError(null);
  }, [open, entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [key]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = { kind: k, head_id: f.head_id, date: f.date, amount: Number(f.amount), party: f.party || null, method: f.method,
                     reference: f.reference || null, note: f.note || null };
      return entry ? api<AccountEntry>(`/accounts/entries/${entry.id}`, { method: "PUT", body }) : api<AccountEntry>("/accounts/entries", { method: "POST", body });
    },
    onSuccess: ({ data }) => { qc.invalidateQueries({ queryKey: ["accounts"] }); toast.success(entry ? "Entry saved" : `${data.voucher_no} recorded`); onOpenChange(false); },
    onError: (e) => setError(errText(e, "Could not save")),
  });
  const options = heads.filter((h) => h.kind === k && (h.is_active || h.id === f.head_id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? `Edit ${entry.voucher_no}` : k === "expense" ? "Record an expense" : "Record income"}</DialogTitle>
          <DialogDescription>{k === "expense" ? "Money the school paid out." : "Money received that isn't a fee (fees are counted automatically)."}</DialogDescription>
        </DialogHeader>
        <form id="entry-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Head" required className="sm:col-span-2">
            {(a) => (
              <Select value={f.head_id || undefined} onValueChange={(v) => setF((x) => ({ ...x, head_id: String(v) }))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue placeholder="Choose">{heads.find((h) => h.id === f.head_id)?.name}</SelectValue></SelectTrigger>
                <SelectContent className="max-h-72">{options.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Amount (₹)" required>{(a) => <Input {...a} type="number" min={0.01} step="0.01" value={f.amount} onChange={set("amount")} />}</Field>
          <Field label="Date" required>{(a) => <Input {...a} type="date" value={f.date} max={iso(new Date())} onChange={set("date")} />}</Field>
          <Field label={k === "expense" ? "Paid to" : "Received from"} className="sm:col-span-2">{(a) => <Input {...a} value={f.party} onChange={set("party")} maxLength={200} />}</Field>
          <Field label="How">
            {(a) => (
              <Select value={f.method} onValueChange={(v) => setF((x) => ({ ...x, method: String(v) }))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{METHODS[f.method]}</SelectValue></SelectTrigger>
                <SelectContent>{Object.entries(METHODS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label={f.method === "cheque" ? "Cheque number" : "Reference"} required={f.method === "cheque"}>{(a) => <Input {...a} value={f.reference} onChange={set("reference")} maxLength={100} />}</Field>
          <Field label="Note" className="sm:col-span-2">{(a) => <Input {...a} value={f.note} onChange={set("note")} maxLength={500} placeholder="e.g. September bill" />}</Field>
        </form>
        {entry && <div><p className="mb-2 text-sm font-medium">Bills and receipts</p><FileList purpose="voucher" ownerId={entry.id} canUpload compact emptyText="Nothing attached" onChanged={() => qc.invalidateQueries({ queryKey: ["accounts"] })} /></div>}
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="entry-form" disabled={!f.head_id || !(Number(f.amount) > 0)} loading={save.isPending} loadingText="Saving…">{entry ? "Save" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeadsCard({ heads }: { heads: LedgerHead[] }) {
  const qc = useQueryClient();
  const can = useCan();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const add = useMutation({
    mutationFn: () => api("/accounts/heads", { method: "POST", body: { kind, name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts", "heads"] }); setName(""); toast.success("Head added"); },
    onError: (e) => toast.error(errText(e, "Could not add")),
  });
  const toggle = useMutation({
    mutationFn: (h: LedgerHead) => api(`/accounts/heads/${h.id}`, { method: "PUT", body: { kind: h.kind, name: h.name, is_active: !h.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts", "heads"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Heads</CardTitle><CardDescription>Group income and expenses the way your accountant reports them.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {(["income", "expense"] as const).map((k) => (
            <div key={k}>
              <p className="mb-2 text-sm font-semibold capitalize">{k}</p>
              <ul className="divide-y rounded-lg border">
                {heads.filter((h) => h.kind === k).map((h) => (
                  <li key={h.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", !h.is_active && "text-muted-foreground")}>
                    <span className="flex-1">{h.name}{!h.is_active && " (hidden)"}</span>
                    <span className="tabular text-xs text-muted-foreground">{inr(h.total_this_year)} this year</span>
                    {can("accounts.manage") && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle.mutate(h)}>{h.is_active ? "Hide" : "Show"}</Button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {can("accounts.manage") && (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <Select value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
              <SelectTrigger className="w-32" aria-label="Kind of head"><SelectValue>{kind === "income" ? "Income" : "Expense"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent>
            </Select>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Library books" aria-label="New head name" className="w-56" maxLength={100} />
            <Button type="submit" variant="outline" disabled={name.trim().length < 2} loading={add.isPending}><Plus aria-hidden />Add head</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AccountsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [range, setRange] = useState<RangeKey>("month");
  const from = iso(RANGES[range].from());
  const to = iso(RANGES[range].to());
  const summary = useAccountsSummary(from, to);
  const heads = useLedgerHeads();
  const [tab, setTab] = useState<"book" | "heads">("book");
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const entries = useAccountEntries({ from, to, page, kind: kind === "all" ? undefined : kind, search: search.trim() || undefined });
  const more = useLoadMore(entries.data?.data, entries.data?.meta, (e) => e.id);
  const [dialog, setDialog] = useState<{ open: boolean; kind: "income" | "expense"; entry: AccountEntry | null }>({ open: false, kind: "expense", entry: null });
  const [removing, setRemoving] = useState<AccountEntry | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/accounts/entries/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setRemoving(null); toast.success("Entry deleted"); },
  });
  const s = summary.data;
  const income = useMemo(() => (s?.income_by_head ?? []).map((h) => ({ label: h.name, value: h.amount })), [s]);
  const expense = useMemo(() => (s?.expense_by_head ?? []).map((h) => ({ label: h.name, value: h.amount })), [s]);
  const manage = can("accounts.manage");
  return (
    <>
      <PageHeader title="Accounts" description="Income and expenses with fee collections included, and exports for your accountant."
        actions={<>
          <Button variant="outline" onClick={() => downloadFile(`/accounts/export/daybook.csv?from=${from}&to=${to}`, "daybook.csv").catch((e) => toast.error(e.message))}><FileDown aria-hidden />Day book CSV</Button>
          <Button variant="outline" onClick={() => downloadFile(`/accounts/export/tally.xml?from=${from}&to=${to}`, "tally.xml").catch((e) => toast.error(e.message))}><FileDown aria-hidden />Tally XML</Button>
          {manage && <Button variant="outline" onClick={() => setDialog({ open: true, kind: "income", entry: null })}><ArrowDownCircle aria-hidden />Income</Button>}
          {manage && <Button onClick={() => setDialog({ open: true, kind: "expense", entry: null })}><ArrowUpCircle aria-hidden />Expense</Button>}
        </>} />
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setPage(1); }}
            className={cn("rounded-full border px-3 py-1 text-sm transition", range === k ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>{RANGES[k].label}</button>
        ))}
        <span className="ml-2 self-center text-xs text-muted-foreground">{formatDate(from)} – {formatDate(to)}</span>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fees collected" value={s ? inr(s.fee_income) : "—"} icon={Landmark} loading={summary.isLoading} />
        <StatCard label="Other income" value={s ? inr(s.other_income) : "—"} icon={ArrowDownCircle} accent="info" loading={summary.isLoading} />
        <StatCard label="Expenses" value={s ? inr(s.expense) : "—"} icon={ArrowUpCircle} accent="warning" loading={summary.isLoading} />
        <StatCard label="Surplus" value={s ? inr(s.net) : "—"} icon={Scale} accent={s && s.net < 0 ? "danger" : "success"} loading={summary.isLoading}
          hint={s ? <span className="inline-flex items-center gap-1"><Banknote className="size-3.5" aria-hidden />Net cash {inr(s.cash_in_hand)}</span> : undefined} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Income and expense</CardTitle><CardDescription>By month · income in blue, expense in amber</CardDescription></CardHeader>
          <CardContent>{s ? <IncomeExpenseChart data={s.by_month} /> : <Skeleton className="h-64" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Where it went</CardTitle><CardDescription>Expenses by head</CardDescription></CardHeader>
          <CardContent>{!s ? <BarListSkeleton /> : expense.length ? <BarList items={expense} format={inr} /> : <p className="text-sm text-muted-foreground">No expenses in this period.</p>}</CardContent>
        </Card>
      </div>
      {(!s || income.length > 0) && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Where it came from</CardTitle></CardHeader>
          <CardContent>{s ? <BarList items={income} format={inr} /> : <BarListSkeleton rows={2} />}</CardContent>
        </Card>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "book" | "heads")} className="mb-4">
        <TabsList><TabsTrigger value="book">Day book</TabsTrigger><TabsTrigger value="heads">Heads</TabsTrigger></TabsList>
      </Tabs>
      {tab === "heads" ? (heads.data ? <HeadsCard heads={heads.data} /> : <Skeleton className="h-48" />) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={(v) => { setKind(String(v)); setPage(1); }}>
              <SelectTrigger className="h-9 w-40" aria-label="Show"><SelectValue>{{ all: "Income and expense", income: "Income", expense: "Expense" }[kind]}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="all">Income and expense</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
            </Select>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search party, note, voucher" className="h-9 pl-9" aria-label="Search entries" />
            </div>
            <p className="ml-auto text-xs text-muted-foreground">Fee payments are listed under Fees › Receipts.</p>
          </div>
          {entries.isLoading && !more.rows.length ? <Skeleton className="h-48 rounded-xl" /> : !more.rows.length ? (
            <EmptyState className="rounded-2xl border bg-card" title="No entries in this period" description="Record expenses such as salaries and bills, and income other than fees."
              action={manage && <Button onClick={() => setDialog({ open: true, kind: "expense", entry: null })}><Plus aria-hidden />Record an expense</Button>} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Day book entries</caption>
                <thead><tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Date</th><th scope="col" className="px-2 py-2 font-medium">Voucher</th>
                  <th scope="col" className="px-2 py-2 font-medium">Head</th><th scope="col" className="px-2 py-2 font-medium">Party</th>
                  <th scope="col" className="px-2 py-2 font-medium">How</th><th scope="col" className="px-2 py-2 text-right font-medium">Amount</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {more.rows.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.date, "d MMM")}</td>
                      <td className="px-2 py-2.5 font-mono text-xs">{e.voucher_no}</td>
                      <td className="px-2 py-2.5">{e.head_name}{e.note && <span className="block text-xs text-muted-foreground">{e.note}</span>}</td>
                      <td className="px-2 py-2.5">{e.party ?? "—"}</td>
                      <td className="px-2 py-2.5 text-xs">{METHODS[e.method] ?? e.method}{e.reference && <span className="block text-muted-foreground">{e.reference}</span>}</td>
                      <td className={cn("px-2 py-2.5 text-right font-semibold tabular whitespace-nowrap", e.kind === "income" ? "text-success" : "")}>
                        {e.kind === "income" ? "+" : "−"}{inr(e.amount)}
                        {e.attachments > 0 && <Paperclip className="ml-1 inline size-3.5 text-muted-foreground" aria-label={`${e.attachments} attached`} />}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {manage && <>
                          <Button variant="ghost" size="icon" aria-label={`Edit ${e.voucher_no}`} onClick={() => setDialog({ open: true, kind: e.kind, entry: e })}><Pencil aria-hidden /></Button>
                          <Button variant="ghost" size="icon" aria-label={`Delete ${e.voucher_no}`} onClick={() => setRemoving(e)}><Trash2 aria-hidden /></Button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <LoadMore shown={more.rows.length} total={more.total} hasMore={more.hasMore} loading={entries.isFetching && page === more.nextPage} fetching={entries.isFetching} onLoadMore={() => setPage(more.nextPage)} noun="entries" />
        </>
      )}
      {heads.data && <EntryDialog entry={dialog.entry} kind={dialog.kind} heads={heads.data} open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />}
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} destructive pending={remove.isPending}
        title={`Delete ${removing?.voucher_no}?`} description="The entry is removed from the day book and reports. This is recorded in the audit log."
        confirmLabel="Delete" onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="accounts.view"><AccountsPage /></PermissionGate>;
}
