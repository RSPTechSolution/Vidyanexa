"use client";

import { format, parseISO } from "date-fns";
import { AlertTriangle, BellRing, CalendarClock, IndianRupee, Percent, Search, Settings2, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { RemindersDialog } from "@/components/fees/collection-tools";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatCard } from "@/components/common/stat-card";
import { BarList } from "@/components/dashboard/bar-list";
import { CollectionChart } from "@/components/dashboard/lazy-charts";
import { CollectDialog, InvoiceStatus, METHODS } from "@/components/fees/shared";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { useCan } from "@/components/session-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InvoiceRow } from "@/lib/api/types";
import { formatDateTime, inr } from "@/lib/format";
import { usePage } from "@/components/common/load-more";
import { useDebounced } from "@/lib/hooks";
import { useClasses, useFeeSummary, useFeeTerms, useInvoices } from "@/lib/queries";

function useParam(name: string): [string | null, (v: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return [params.get(name), (v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(name, v); else next.delete(name);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }];
}

const lakh = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(2)} L` : inr(n));

function Dashboard() {
  const summary = useFeeSummary();
  const s = summary.data;
  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem><StatCard label="Collected today" value={s ? inr(s.collected_today) : "—"} loading={summary.isLoading} icon={IndianRupee} accent="success" hint={s ? `${lakh(s.collected_month)} this month` : undefined} /></StaggerItem>
        <StaggerItem><StatCard label="Collected this year" value={s ? lakh(s.collected_year) : "—"} loading={summary.isLoading} icon={TrendingUp} hint={s ? `of ${lakh(s.billed_year)} billed` : undefined} /></StaggerItem>
        <StaggerItem><StatCard label="Overdue" value={s ? lakh(s.overdue) : "—"} loading={summary.isLoading} icon={AlertTriangle} accent="warning" hint={s ? `${s.overdue_invoices} invoices past due` : undefined} href="/fees?tab=invoices&status=overdue" /></StaggerItem>
        <StaggerItem><StatCard label="Collection rate" value={s?.collection_rate != null ? `${s.collection_rate}%` : "—"} loading={summary.isLoading} icon={Percent} accent="info" hint="Of fees already due" /></StaggerItem>
      </Stagger>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Daily collections</CardTitle><CardDescription>Last 30 days</CardDescription></CardHeader>
          <CardContent>{s ? <CollectionChart data={s.daily} /> : <Skeleton className="h-60" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>How families pay</CardTitle><CardDescription>This academic year</CardDescription></CardHeader>
          <CardContent>{s ? <BarList items={s.by_method.map((m) => ({ label: METHODS[m.method]?.label ?? m.method, value: m.amount, hint: `${m.count}` }))} format={lakh} /> : <Skeleton className="h-48" />}</CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Outstanding by class</CardTitle><CardDescription>Everything not yet paid, including fees not yet due</CardDescription></CardHeader>
          <CardContent>{s ? <BarList items={s.by_class.map((c) => ({ label: c.class_name, value: c.outstanding, hint: `${c.students} students` }))} format={inr} /> : <Skeleton className="h-60" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div><CardTitle>Recent payments</CardTitle><CardDescription>Recorded at the counter</CardDescription></div>
          </CardHeader>
          <CardContent>
            {!s ? <Skeleton className="h-60" /> : (
              <ul className="divide-y">
                {s.recent.map((p) => {
                  const M = METHODS[p.method] ?? METHODS.cash;
                  return (
                    <li key={p.id}>
                      <Link href={`/fees/receipts/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"><M.icon className="size-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.receipt_no} · {M.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.collected_by ?? "—"} · {formatDateTime(p.paid_at)}</span>
                        </span>
                        <span className="font-semibold tabular">{inr(p.amount)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const STATUS_FILTERS: Record<string, string> = { all: "Any status", due: "Not fully paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Part paid", paid: "Paid" };

function Invoices() {
  const can = useCan();
  const classes = useClasses();
  const terms = useFeeTerms();
  const [search, setSearch] = useState(useSearchParams().get("q") ?? ""); // quick actions link here with ?q=
  const [statusParam, setStatus] = useParam("status");
  const status = statusParam ?? "all";
  const [classId, setClassId] = useState("all");
  const [term, setTerm] = useState("all");
  const [collecting, setCollecting] = useState<InvoiceRow | null>(null);
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(q);
  const invoices = useInvoices({
    page, search: q || undefined, status: status === "all" ? undefined : status,
    class_id: classId === "all" ? undefined : classId, term: term === "all" ? undefined : term,
  });
  const columns = useMemo<Col<InvoiceRow>[]>(() => [
    {
      id: "student", header: "Student",
      cell: ({ row: { original: i } }) => (
        <Link href={`/fees/invoices/${i.id}`} className="group block min-w-0">
          <span className="block truncate font-medium group-hover:text-primary group-hover:underline">{i.student_name}</span>
          <span className="block text-xs text-muted-foreground">{i.class_section} · {i.admission_no}</span>
        </Link>
      ),
    },
    { id: "term", header: "Term", cell: ({ row: { original: i } }) => <span className="block max-w-48 truncate text-sm">{i.term}<span className="block font-mono text-xs text-muted-foreground">{i.invoice_no}</span></span> },
    { id: "due", header: "Due", cell: ({ row: { original: i } }) => <span className="whitespace-nowrap text-sm">{format(parseISO(i.due_date), "d MMM yyyy")}</span> },
    { id: "total", header: "Total", cell: ({ row: { original: i } }) => <span className="tabular">{inr(i.total - i.discount)}</span> },
    { id: "balance", header: "Balance", cell: ({ row: { original: i } }) => <span className={i.balance > 0 ? "font-semibold tabular" : "text-muted-foreground tabular"}>{inr(i.balance)}</span> },
    { id: "status", header: "Status", cell: ({ row: { original: i } }) => <InvoiceStatus inv={i} /> },
    {
      id: "act", header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: i } }) => can("fees.collect") && i.balance > 0
        ? <Button size="sm" variant="outline" onClick={() => setCollecting(i)}><Wallet aria-hidden />Collect</Button> : null,
    },
  ], [can]);
  const reset = () => setPage(1);
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Student, admission or invoice no." className="h-9 pl-9" aria-label="Search invoices" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? null : String(v)); reset(); }}>
          <SelectTrigger className="h-9 lg:w-40" aria-label="Status"><SelectValue>{STATUS_FILTERS[status]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(STATUS_FILTERS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={classId} onValueChange={(v) => { setClassId(String(v)); reset(); }}>
          <SelectTrigger className="h-9 lg:w-40" aria-label="Class"><SelectValue>{classId === "all" ? "All classes" : classes.data?.find((c) => c.id === classId)?.name}</SelectValue></SelectTrigger>
          <SelectContent className="max-h-72"><SelectItem value="all">All classes</SelectItem>{classes.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={term} onValueChange={(v) => { setTerm(String(v)); reset(); }}>
          <SelectTrigger className="h-9 lg:w-60" aria-label="Term"><SelectValue>{term === "all" ? "All terms" : term}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="all">All terms</SelectItem>{terms.data?.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DataTable caption="Fee invoices" columns={columns} data={invoices.data?.data ?? []} meta={invoices.data?.meta} loading={invoices.isLoading}
        refreshing={invoices.isFetching && !invoices.isLoading} page={page} onPageChange={setPage} getRowId={(i) => i.id}
        empty={<EmptyState title="No invoices match" description={can("fees.manage") ? "Try another filter, or generate invoices for a term in Fee setup." : "Try another filter."} />} />
      {collecting && <CollectDialog invoice={collecting} open onOpenChange={(o) => !o && setCollecting(null)} />}
    </>
  );
}

function FeesPage() {
  const can = useCan();
  const [tabParam, setTab] = useParam("tab");
  const tab = tabParam ?? "dashboard";
  const [reminding, setReminding] = useState(false);
  return (
    <>
      <PageHeader title="Fees" description="Collections, dues and receipts."
        actions={<>
          {can("fees.collect") && <Button variant="outline" className="h-9" onClick={() => setReminding(true)}><BellRing aria-hidden />Send reminders</Button>}
          {can("fees.manage") && <Link href="/fees/setup" className={buttonVariants({ variant: "outline", className: "h-9" })}><Settings2 aria-hidden />Fee setup</Link>}
        </>} />
      <RemindersDialog open={reminding} onOpenChange={setReminding} />
      <Tabs value={tab} onValueChange={(v) => setTab(v === "dashboard" ? null : String(v))} className="mb-5">
        <TabsList>
          <TabsTrigger value="dashboard"><CalendarClock aria-hidden />Dashboard</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "dashboard" ? <Dashboard /> : <Invoices />}
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="fees.view">
      <Suspense><FeesPage /></Suspense>
    </PermissionGate>
  );
}
