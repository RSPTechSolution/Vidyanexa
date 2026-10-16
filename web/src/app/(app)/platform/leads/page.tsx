"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { formatDateTime, inr, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS: Record<string, string> = { all: "All enquiries", contact: "Contact form", quote: "Quote requests", upgrade: "Upgrade requests" };
const STATUSES: Record<string, string> = { all: "Any status", new: "New", contacted: "Contacted", closed: "Closed" };
const KIND_STYLE: Record<string, string> = {
  contact: "bg-muted text-foreground", quote: "bg-info/10 text-info", upgrade: "bg-success/10 text-success",
};

function LeadsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("new");
  const leads = useQuery({
    queryKey: ["platform", "leads", { page, kind, status }],
    placeholderData: keepPreviousData,
    queryFn: () => api<Lead[]>("/platform/leads", { query: { page, page_size: 20, kind: kind === "all" ? undefined : kind, status: status === "all" ? undefined : status } }),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api<Lead>(`/platform/leads/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform", "leads"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update"),
  });

  const columns = useMemo<Col<Lead>[]>(() => [
    {
      id: "who",
      header: "From",
      cell: ({ row: { original: l } }) => (
        <div className="min-w-48">
          <p className="font-medium">{l.name}</p>
          {l.school_name && <p className="text-xs text-muted-foreground">{l.school_name}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
            <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="size-3" aria-hidden />{l.email}</a>
            {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="size-3" aria-hidden />{l.phone}</a>}
          </p>
        </div>
      ),
    },
    { id: "kind", header: "Type", cell: ({ row }) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", KIND_STYLE[row.original.kind])}>{row.original.kind}</span> },
    {
      id: "details",
      header: "Details",
      cell: ({ row: { original: l } }) => (
        <div className="max-w-md space-y-1 text-sm">
          {l.plan_code && <p>Wants: <span className="font-medium capitalize">{l.plan_code}</span></p>}
          {(l.students || l.quoted_monthly) && (
            <p className="text-muted-foreground">
              {l.students && `${l.students.toLocaleString("en-IN")} students`}{l.quoted_monthly ? ` · quoted ${inr(l.quoted_monthly)}/month` : ""}
            </p>
          )}
          {l.modules.length > 0 && <p className="text-xs text-muted-foreground">{l.modules.join(", ")}</p>}
          {l.message && <p className="line-clamp-3 text-muted-foreground" title={l.message}>{l.message}</p>}
        </div>
      ),
    },
    { id: "when", header: "Received", cell: ({ row }) => <time className="whitespace-nowrap text-muted-foreground" dateTime={row.original.created_at} title={formatDateTime(row.original.created_at)}>{timeAgo(row.original.created_at)}</time> },
    {
      id: "status",
      header: "Status",
      cell: ({ row: { original: l } }) => (
        <Select value={l.status} onValueChange={(v) => update.mutate({ id: l.id, status: String(v) })}>
          <SelectTrigger className="h-8 w-32" aria-label={`Status for ${l.name}`}><SelectValue>{STATUSES[l.status]}</SelectValue></SelectTrigger>
          <SelectContent>{["new", "contacted", "closed"].map((s) => <SelectItem key={s} value={s}>{STATUSES[s]}</SelectItem>)}</SelectContent>
        </Select>
      ),
    },
  ], [update]);

  return (
    <>
      <PageHeader title="Leads" description="Enquiries from the website and upgrade requests from schools." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select value={kind} onValueChange={(v) => { setKind(String(v)); setPage(1); }}>
          <SelectTrigger className="h-9 sm:w-52" aria-label="Filter by type"><SelectValue>{KINDS[kind]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(String(v)); setPage(1); }}>
          <SelectTrigger className="h-9 sm:w-40" aria-label="Filter by status"><SelectValue>{STATUSES[status]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DataTable
        caption="Leads"
        columns={columns}
        data={leads.data?.data ?? []}
        meta={leads.data?.meta}
        loading={leads.isLoading}
        refreshing={leads.isFetching && !leads.isLoading}
        page={page} onPageChange={setPage}
        getRowId={(l) => l.id}
        empty={<EmptyState icon={Inbox} title="No enquiries here" description="New enquiries from the website appear here." />}
      />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate superAdmin>
      <LeadsPage />
    </PermissionGate>
  );
}
