"use client";

import { flexRender, tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { LoadMore, useLoadMore } from "@/components/common/load-more";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Paging, sorting and filtering happen on the server, so only the core features are needed.
const features = tableFeatures({});
export type Col<T extends RowData> = ColumnDef<typeof features, T>;

const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-1/3"];

interface DataTableProps<T extends RowData> {
  columns: Col<T>[];
  data: T[];
  /** Server-side pagination info. Omit for a single, unpaginated page. */
  meta?: PageMeta | null;
  /** The page last asked for, with `onPageChange`: the list grows to it as it scrolls. */
  page?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  /** Showing previous results while new ones load (search, filter, paging). */
  refreshing?: boolean;
  empty?: React.ReactNode;
  caption: string;
  getRowId?: (row: T) => string;
  /** Makes the whole row open this page. Keep a real link in the row too (e.g. on the name) for keyboards and screen readers. */
  rowHref?: (row: T) => string;
}

// Clicks on these inside a clickable row do their own thing instead of opening the row.
const INTERACTIVE = "a, button, input, select, textarea, label, [role=menuitem], [role=checkbox], [data-no-row-click]";

export function DataTable<T extends RowData>({ columns, data, meta, page = 1, onPageChange, loading, refreshing, empty, caption, getRowId, rowHref }: DataTableProps<T>) {
  const router = useRouter();
  // Paged lists grow as they scroll instead of flipping pages: the next page is added under the rows already shown.
  const list = useLoadMore(data, meta ?? undefined, (r) => (getRowId ? getRowId(r) : String((r as { id?: unknown }).id ?? JSON.stringify(r))));
  const rows = meta ? list.rows : data;
  // Loading more only while the page asked for is the one still to come; a search or filter refetch (back to page 1)
  // shows as a refresh.
  const loadingMore = Boolean(meta && page > 1 && page === list.nextPage && (refreshing || loading));
  const busy = loading && rows.length === 0;
  const table = useTable<typeof features, T>({
    features,
    data: rows,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card shadow-xs" aria-busy={loading || refreshing || undefined}>
      {refreshing && !loadingMore && (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/15" role="status" aria-label="Updating results">
          <div className="indeterminate-bar h-full w-1/3 rounded-full bg-primary" />
        </div>
      )}
      <div className={cn("overflow-x-auto transition-opacity duration-200", refreshing && !loadingMore && "pointer-events-none opacity-55")}>
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} scope="col" className="h-10 px-4 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {busy ? (
              Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} className="border-b last:border-0">
                  {columns.map((_, c) => (
                    <td key={c} className="px-4 py-3.5">
                      <Skeleton className={cn("h-4", SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length])} />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{empty ?? <p className="py-12 text-center text-muted-foreground">Nothing here yet.</p>}</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("group/row border-b transition-colors last:border-0 hover:bg-muted/30", rowHref && "cursor-pointer")}
                  onClick={rowHref ? (e) => {
                    if ((e.target as HTMLElement).closest(INTERACTIVE) || window.getSelection()?.toString()) return;
                    const href = rowHref(row.original);
                    if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
                    else router.push(href);
                  } : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {meta && meta.total > 0 && (
        <LoadMore
          className="border-t"
          shown={rows.length}
          total={meta.total}
          hasMore={list.hasMore}
          loading={loadingMore}
          fetching={refreshing || loading}
          onLoadMore={() => onPageChange?.(list.nextPage)}
          noun={caption.toLowerCase()}
        />
      )}
    </div>
  );
}
