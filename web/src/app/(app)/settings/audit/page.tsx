"use client";

import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeAudit } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";
import { useAudit, type AuditRow } from "@/lib/queries";

const FILTERS: Record<string, string> = {
  all: "All activity",
  "auth.": "Sign-ins & passwords",
  "user.": "User changes",
  "school.": "School settings",
};

function AuditPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const audit = useAudit({ page, action: filter === "all" ? undefined : filter });

  const columns = useMemo<Col<AuditRow>[]>(() => [
    {
      id: "when",
      header: "When",
      cell: ({ row }) => <time dateTime={row.original.created_at} className="whitespace-nowrap tabular">{formatDateTime(row.original.created_at)}</time>,
    },
    { id: "who", header: "Who", cell: ({ row }) => <span className="font-medium">{row.original.user_name ?? "System"}</span> },
    {
      id: "what",
      header: "What",
      cell: ({ row: { original: e } }) => (
        <div>
          <p>{describeAudit(e.action, e.meta, e.entity_id)}</p>
          {Array.isArray(e.meta.fields) && e.meta.fields.length > 0 && (
            <p className="text-xs text-muted-foreground">Fields: {(e.meta.fields as string[]).join(", ").replace(/_/g, " ")}</p>
          )}
        </div>
      ),
    },
    { id: "ip", header: "IP address", cell: ({ row }) => <code className="font-mono text-xs text-muted-foreground">{row.original.ip_address ?? "—"}</code> },
  ], []);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of sign-ins and changes in your school."
        actions={
          <Select value={filter} onValueChange={(v) => { setFilter(String(v)); setPage(1); }}>
            <SelectTrigger className="h-9 w-52" aria-label="Filter activity"><SelectValue>{FILTERS[filter]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(FILTERS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <DataTable
        caption="Audit log"
        columns={columns}
        data={audit.data?.data ?? []}
        meta={audit.data?.meta}
        loading={audit.isLoading}
        refreshing={audit.isFetching && !audit.isLoading}
        page={page} onPageChange={setPage}
        getRowId={(e) => e.id}
        empty={<EmptyState icon={ScrollText} title="No activity recorded" />}
      />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="audit.view">
      <AuditPage />
    </PermissionGate>
  );
}
