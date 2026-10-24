"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight, Download, File as FileIcon, FileImage, FileText, FolderOpen, HardDrive, LayoutGrid, List, Search, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { LoadMore, useLoadMore, usePage } from "@/components/common/load-more";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { formatBytes } from "@/components/common/usage-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, fileUrl } from "@/lib/api/client";
import type { StorageFile, StorageSummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Group = "photos" | "documents" | "homework" | "other";
type Sort = "largest" | "newest" | "oldest" | "name" | "smallest";

// Each kind of file has its colour in the bar and the legend, like Drive's storage page.
const GROUPS: Record<Group, { label: string; color: string; icon: typeof FileIcon }> = {
  photos: { label: "Photos", color: "bg-chart-1", icon: FileImage },
  documents: { label: "Documents", color: "bg-chart-2", icon: FileText },
  homework: { label: "Homework", color: "bg-chart-3", icon: FolderOpen },
  other: { label: "Other", color: "bg-chart-4", icon: FileIcon },
};
const SORTS: Record<Sort, string> = { largest: "Largest first", newest: "Newest first", oldest: "Oldest first", name: "Name (A–Z)", smallest: "Smallest first" };
const VIEW_KEY = "vnx-storage-view";

export default function StoragePage() {
  return (
    <PermissionGate permission="school.manage">
      <Storage />
    </PermissionGate>
  );
}

function Storage() {
  const qc = useQueryClient();
  const [group, setGroup] = useState<Group | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("largest");
  const [view, setView] = useState<"grid" | "list">("list");
  const [selected, setSelected] = useState<Map<string, StorageFile>>(new Map());
  const [confirm, setConfirm] = useState<StorageFile[] | null>(null);
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(group, q, sort);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const changeView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const summary = useQuery({ queryKey: ["storage", "summary"], queryFn: async () => (await api<StorageSummary>("/storage")).data });
  const files = useQuery({
    queryKey: ["storage", "files", { group, q, sort, page }],
    placeholderData: (prev) => prev,
    queryFn: () => api<StorageFile[]>("/storage/files", { query: { group: group === "all" ? undefined : group, search: q || undefined, sort, page, page_size: 40 } }),
  });
  const more = useLoadMore(files.data?.data, files.data?.meta, (f) => f.id);

  const remove = useMutation({
    mutationFn: async (list: StorageFile[]) => (await api<{ deleted: number; freed: number }>("/storage/delete", { method: "POST", body: { ids: list.map((f) => f.id) } })).data,
    onSuccess: (r) => {
      toast.success(`Deleted ${r.deleted} file${r.deleted === 1 ? "" : "s"} · ${formatBytes(r.freed)} freed`);
      setSelected(new Map());
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["storage"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not delete the files"),
  });

  const toggle = (f: StorageFile) => setSelected((s) => {
    const next = new Map(s);
    if (next.has(f.id)) next.delete(f.id); else next.set(f.id, f);
    return next;
  });
  const chosen = [...selected.values()];
  const chosenBytes = chosen.reduce((n, f) => n + f.size, 0);
  const allShownChosen = more.rows.length > 0 && more.rows.every((f) => selected.has(f.id));
  const toggleAllShown = () => setSelected((s) => {
    const next = new Map(s);
    if (allShownChosen) more.rows.forEach((f) => next.delete(f.id));
    else more.rows.forEach((f) => next.set(f.id, f));
    return next;
  });

  return (
    <div>
      <PageHeader title="Storage" description="Everything your school has uploaded: photos, documents and attachments. Delete what you no longer need to free up space." />
      <Overview summary={summary.data} loading={summary.isLoading} group={group} onGroup={setGroup} />

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file names" className="h-9 pl-9" aria-label="Search files" />
        </div>
        <div className="flex items-center gap-3">
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-9 flex-1 sm:w-44 sm:flex-none" aria-label="Sort files"><SelectValue>{SORTS[sort]}</SelectValue></SelectTrigger>
          <SelectContent>{(Object.keys(SORTS) as Sort[]).map((s) => <SelectItem key={s} value={s}>{SORTS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex w-fit shrink-0 rounded-full border p-0.5" role="group" aria-label="View">
          {(["list", "grid"] as const).map((v) => {
            const Icon = v === "list" ? List : LayoutGrid;
            return (
              <button key={v} type="button" aria-pressed={view === v} aria-label={v === "list" ? "List view" : "Grid view"} onClick={() => changeView(v)}
                className={cn("flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {/* Selection bar */}
      {chosen.length > 0 && (
        <div className="sticky top-16 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-primary-container px-4 py-2.5 text-primary-container-foreground shadow-sm" role="region" aria-label="Selected files">
          <button type="button" onClick={() => setSelected(new Map())} className="flex size-8 items-center justify-center rounded-full hover:bg-black/5" aria-label="Clear selection"><X className="size-4" aria-hidden /></button>
          <span className="font-medium">{chosen.length} selected · {formatBytes(chosenBytes)}</span>
          <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setConfirm(chosen)}><Trash2 aria-hidden />Delete</Button>
        </div>
      )}

      {/* Files */}
      <div className="mt-4">
        {files.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : more.rows.length === 0 ? (
          <EmptyState icon={HardDrive} title={q || group !== "all" ? "No files match" : "No files yet"}
            description={q || group !== "all" ? "Try another search or kind of file." : "Photos, documents and homework attachments appear here as people upload them."} />
        ) : view === "list" ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Checkbox checked={allShownChosen} onCheckedChange={toggleAllShown} aria-label="Select all shown files" />
              <span className="flex-1">Name</span>
              <span className="hidden w-48 md:block">Belongs to</span>
              <span className="hidden w-28 sm:block">Uploaded</span>
              <span className="hidden w-20 text-right sm:block">Size</span>
              <span className="w-16 sm:w-20" />
            </div>
            <ul className="divide-y">
              {more.rows.map((f) => (
                <li key={f.id} className={cn("group/row flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30", selected.has(f.id) && "bg-primary/5")}>
                  <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f)} aria-label={`Select ${f.filename}`} />
                  <Thumb file={f} className="size-10 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-primary hover:underline">{f.filename}</a>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="sm:hidden">{formatBytes(f.size)} · </span>{f.purpose_label}{f.owner ? <span className="md:hidden"> · {f.owner}</span> : null}
                    </p>
                  </div>
                  <span className="hidden w-48 truncate text-sm text-muted-foreground md:block">{f.owner ?? "—"}</span>
                  <span className="hidden w-28 text-sm text-muted-foreground sm:block">{formatDate(f.created_at)}</span>
                  <span className="hidden w-20 text-right text-sm font-medium tabular sm:block">{formatBytes(f.size)}</span>
                  <RowActions file={f} onDelete={() => setConfirm([f])} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {more.rows.map((f) => (
              <li key={f.id} className={cn("group/row relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md", selected.has(f.id) && "ring-2 ring-primary")}>
                <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="block" aria-label={`Open ${f.filename}`}>
                  <Thumb file={f} className="aspect-[4/3] w-full" large />
                </a>
                <span className={cn("absolute top-2 left-2 rounded-md bg-card/90 p-1 shadow-sm transition-opacity", selected.has(f.id) ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100")}>
                  <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f)} aria-label={`Select ${f.filename}`} />
                </span>
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={f.filename}>{f.filename}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatBytes(f.size)} · {f.owner ?? f.purpose_label}</p>
                  </div>
                  <RowActions file={f} onDelete={() => setConfirm([f])} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
        <LoadMore shown={more.rows.length} total={more.total} hasMore={more.hasMore} loading={files.isFetching && page === more.nextPage}
          fetching={files.isFetching} onLoadMore={() => setPage(more.nextPage)} noun="files" />
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? `Delete "${confirm[0].filename}"?` : `Delete ${confirm?.length ?? 0} files?`}
        description={confirm ? (
          <>This frees {formatBytes(confirm.reduce((n, f) => n + f.size, 0))}. Deleted files can&apos;t be recovered.
            {confirm.some((f) => f.group === "photos") ? " Deleted photos also disappear from the profiles that show them." : ""}</>
        ) : ""}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirm && remove.mutate(confirm)}
      />
    </div>
  );
}

/** "2.4 GB of 50 GB used", the bar split by kind of file, and a legend that filters the list. */
function Overview({ summary: s, loading, group, onGroup }: { summary?: StorageSummary; loading: boolean; group: Group | "all"; onGroup: (g: Group | "all") => void }) {
  if (loading || !s) {
    return <Card><CardContent className="space-y-4 py-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-3 w-full rounded-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>;
  }
  const pct = s.limit ? (s.used / s.limit) * 100 : 0;
  const share = (b: number) => (s.limit ? Math.max((b / s.limit) * 100, b > 0 ? 0.6 : 0) : 0); // tiny amounts still show a sliver
  const full = pct >= 100;
  return (
    <Card>
      <CardContent className="py-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Storage on the {s.plan_name} plan</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
              {formatBytes(s.used)} <span className="text-lg font-normal text-muted-foreground">of {s.storage_gb} GB used</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">{formatBytes(s.free)} free</span> · {s.files.toLocaleString("en-IN")} file{s.files === 1 ? "" : "s"}</p>
          </div>
          <Link href="/settings/billing" className={buttonVariants({ variant: "outline" })}>Get more space<ArrowUpRight aria-hidden /></Link>
        </div>

        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-muted" role="img"
          aria-label={`${formatBytes(s.used)} of ${s.storage_gb} GB used: ${s.groups.map((g) => `${GROUPS[g.group as Group]?.label ?? g.group} ${formatBytes(g.bytes)}`).join(", ")}`}>
          {s.groups.map((g) => (
            <div key={g.group} className={cn("h-full transition-[width] duration-500 first:rounded-l-full", GROUPS[g.group as Group]?.color ?? "bg-chart-5")} style={{ width: `${share(g.bytes)}%` }} />
          ))}
        </div>

        {pct >= 80 && (
          <Alert variant={full ? "destructive" : "default"} className="mt-4">
            <AlertDescription>
              {full ? "Storage is full: new uploads are paused. Delete files you no longer need, or move to a bigger plan." : `You've used ${Math.floor(pct)}% of your storage. Delete old files or move to a bigger plan before it fills up.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Show files of one kind">
          <LegendChip active={group === "all"} onClick={() => onGroup("all")} label="All files" detail={formatBytes(s.used)} />
          {(Object.keys(GROUPS) as Group[]).map((key) => {
            const g = s.groups.find((x) => x.group === key);
            if (!g) return null;
            return <LegendChip key={key} active={group === key} onClick={() => onGroup(key)} label={GROUPS[key].label} detail={`${formatBytes(g.bytes)} · ${g.files}`} color={GROUPS[key].color} />;
          })}
          <span className="flex items-center gap-2 px-2 text-sm text-muted-foreground"><span className="size-2.5 rounded-full bg-muted ring-1 ring-border" aria-hidden />Free {formatBytes(s.free)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendChip({ active, onClick, label, detail, color }: { active: boolean; onClick: () => void; label: string; detail: string; color?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
      {color && <span className={cn("size-2.5 rounded-full", color)} aria-hidden />}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground tabular">{detail}</span>
    </button>
  );
}

function Thumb({ file, className, large }: { file: StorageFile; className?: string; large?: boolean }) {
  const Icon = useMemo(() => (file.content_type.startsWith("image/") ? FileImage : file.content_type === "application/pdf" || file.content_type.startsWith("text/") ? FileText : FileIcon), [file.content_type]);
  const [failed, setFailed] = useState(false);
  if (file.content_type.startsWith("image/") && !failed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- private API image */
      <img src={fileUrl(file.id)} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("shrink-0 bg-muted object-cover", className)} />
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted text-muted-foreground", className)}>
      <Icon className={large ? "size-10" : "size-5"} aria-hidden />
    </span>
  );
}

function RowActions({ file, onDelete, compact }: { file: StorageFile; onDelete: () => void; compact?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center", compact ? "" : "w-16 justify-end sm:w-20 sm:gap-1")}>
      <a href={fileUrl(file.id, true)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Download ${file.filename}`}>
        <Download className="size-4" aria-hidden />
      </a>
      <button type="button" onClick={onDelete} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${file.filename}`}>
        <Trash2 className="size-4" aria-hidden />
      </button>
    </span>
  );
}
