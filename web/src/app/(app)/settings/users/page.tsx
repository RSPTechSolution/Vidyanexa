"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, Upload, UserX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type Col } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ImportDialog, exportCsv } from "@/components/common/import-dialog";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { useCan, useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { SCHOOL_ROLES, formatDateTime, initials, roleLabel, timeAgo } from "@/lib/format";
import { usePage } from "@/components/common/load-more";
import { useDebounced } from "@/lib/hooks";
import { useUsers } from "@/lib/queries";
import { SetPasswordDialog, UserFormDialog } from "@/components/users/user-dialogs";

type Pending = { kind: "delete" | "deactivate" | "activate"; user: User } | null;

function UsersPage() {
  const me = useSession();
  const can = useCan();
  const manage = can("users.manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(q);

  const users = useUsers({
    page, search: q || undefined, role: role === "all" ? undefined : role,
    is_active: status === "all" ? undefined : status === "active",
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [importing, setImporting] = useState(false);

  const action = useMutation({
    mutationFn: async ({ kind, user }: NonNullable<Pending>) =>
      kind === "delete"
        ? api(`/users/${user.id}`, { method: "DELETE" })
        : api(`/users/${user.id}`, { method: "PATCH", body: { is_active: kind === "activate" } }),
    onSuccess: (_d, { kind, user }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setPending(null);
      toast.success(`${user.full_name} ${kind === "delete" ? "deleted" : kind === "activate" ? "reactivated" : "deactivated"}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong",
        e instanceof ApiError && e.code === "PLAN_LIMIT_REACHED"
          ? { action: { label: "View plans", onClick: () => window.location.assign("/settings/billing") } }
          : undefined),
  });

  const columns = useMemo<Col<User>[]>(() => [
    {
      id: "user",
      header: "User",
      cell: ({ row: { original: u } }) => (
        <div className="flex items-center gap-3">
          <Avatar><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(u.full_name)}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              <Link href={`/settings/users/${u.id}`} className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{u.full_name}</Link>
              {u.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { id: "role", header: "Role", cell: ({ row }) => <span className="whitespace-nowrap">{roleLabel(row.original.role)}</span> },
    {
      id: "status",
      header: "Status",
      cell: ({ row: { original: u } }) =>
        !u.is_active ? <StatusBadge status="inactive" /> : u.must_change_password ? <StatusBadge tone="warning" label="Password pending" /> : <StatusBadge status="active" />,
    },
    {
      id: "last",
      header: "Last sign-in",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.last_login_at)}>
          {row.original.last_login_at ? timeAgo(row.original.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: u } }) =>
        manage && u.id !== me.id ? (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${u.full_name}`} />}>
                <MoreHorizontal aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => { setEditing(u); setFormOpen(true); }}><Pencil aria-hidden />Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPwUser(u)}><KeyRound aria-hidden />Reset password</DropdownMenuItem>
                {u.is_active ? (
                  <DropdownMenuItem onClick={() => setPending({ kind: "deactivate", user: u })}><UserX aria-hidden />Deactivate</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setPending({ kind: "activate", user: u })}><Power aria-hidden />Reactivate</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setPending({ kind: "delete", user: u })}><Trash2 aria-hidden />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null,
    },
  ], [manage, me.id]);

  const filtered = Boolean(q) || role !== "all" || status !== "all";

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Everyone who can sign in to your school: staff, parents and students."
        actions={<>
          <Button variant="outline" onClick={() => exportCsv("/transfer/staff/export", "staff")}><Download aria-hidden />Export staff</Button>
          {manage && <Button variant="outline" onClick={() => setImporting(true)}><Upload aria-hidden />Import staff</Button>}
          {manage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus aria-hidden />Add user</Button>}
        </>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, email or phone" className="h-9 pl-9" aria-label="Search users" />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(String(v)); setPage(1); }}>
          <SelectTrigger className="h-9 sm:w-48" aria-label="Filter by role"><SelectValue>{role === "all" ? "All roles" : roleLabel(role)}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {SCHOOL_ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(String(v)); setPage(1); }}>
          <SelectTrigger className="h-9 sm:w-40" aria-label="Filter by status">
            <SelectValue>{{ all: "Any status", active: "Active", inactive: "Inactive" }[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        caption="Users"
        columns={columns}
        data={users.data?.data ?? []}
        meta={users.data?.meta}
        loading={users.isLoading}
        refreshing={users.isFetching && !users.isLoading}
        page={page} onPageChange={setPage}
        getRowId={(u) => u.id}
        rowHref={(u) => `/settings/users/${u.id}`}
        empty={
          <EmptyState
            icon={UserX}
            title={filtered ? "No users match these filters" : "No users yet"}
            description={filtered ? "Try a different search or clear the filters." : "Add staff so they can sign in."}
          />
        }
      />
      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
      <SetPasswordDialog open={Boolean(pwUser)} onOpenChange={(o) => !o && setPwUser(null)} user={pwUser} />
      {manage && <ImportDialog kind="staff" open={importing} onOpenChange={setImporting} />}
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        pending={action.isPending}
        destructive={pending?.kind !== "activate"}
        title={pending?.kind === "delete" ? "Delete user?" : pending?.kind === "activate" ? "Reactivate user?" : "Deactivate user?"}
        description={
          pending?.kind === "delete"
            ? `${pending.user.full_name} will lose access permanently. Their past activity stays in the audit log.`
            : pending?.kind === "activate"
              ? `${pending?.user.full_name} will be able to sign in again.`
              : `${pending?.user.full_name} will be signed out everywhere and can't sign in until reactivated.`
        }
        confirmLabel={pending?.kind === "delete" ? "Delete" : pending?.kind === "activate" ? "Reactivate" : "Deactivate"}
        onConfirm={() => pending && action.mutate(pending)}
      />
    </>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="users.view">
      <UsersPage />
    </PermissionGate>
  );
}
