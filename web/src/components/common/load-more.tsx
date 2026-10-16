"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PageMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Turns a paged list into a growing one: each page the server returns is kept, and the next page is added under it.
 * Starts over when page 1 comes back (every search or filter goes back to page 1). Pages are stored by number, so a
 * page fetched again after a change (an item added or removed) replaces its old copy and the earlier pages stay.
 */
export function useLoadMore<T>(data: T[] | undefined, meta: PageMeta | null | undefined, getId: (row: T) => string) {
  const [pages, setPages] = useState<Map<number, T[]>>(new Map());
  const idOf = useRef(getId);
  idOf.current = getId;

  useEffect(() => {
    if (!data || !meta) return;
    setPages((prev) => {
      const next = new Map(meta.page === 1 ? [] : prev);
      next.set(meta.page, data);
      return next;
    });
  }, [data, meta]);

  const seen = new Set<string>();
  const rows: T[] = [];
  for (const [, list] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    for (const r of list) {
      const id = idOf.current(r);
      if (!seen.has(id)) {
        seen.add(id);
        rows.push(r);
      }
    }
  }
  const lastPage = pages.size ? Math.max(...pages.keys()) : meta?.page ?? 1;
  // Until the first page lands, show what the query has.
  const shown = pages.size ? rows : data ?? [];
  return { rows: shown, total: meta?.total ?? shown.length, hasMore: meta ? lastPage * meta.page_size < meta.total : false, nextPage: lastPage + 1 };
}

/**
 * The page of a growing list, back to 1 the moment what is searched for changes. A typed search is applied a moment
 * later (debounced), so resetting only when typing would let the old list scroll on in between and the new search
 * start from page 2; tying the page to the search itself closes that gap.
 */
export function usePage(...filters: unknown[]) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const setPage = useCallback((page: number) => setState({ key, page }), [key]);
  return [page, setPage] as const;
}

/**
 * The end of a growing list: the next page loads by itself as it scrolls near (a screen ahead, so it is usually there
 * before it is reached). Shows how many are showing, announced to screen readers as the list grows. Keyboard users
 * get the same: tabbing to the last rows scrolls them into view, which loads the next page.
 */
export function LoadMore({ shown, total, hasMore, loading, fetching, onLoadMore, noun = "items", className }: {
  shown: number; total: number; hasMore: boolean;
  /** The next page is on its way. */
  loading?: boolean;
  /** Anything for this list is on its way, such as a new search. Nothing more loads until it lands: until then the
   *  rows on screen may be the old ones, and asking for "their" next page would send the new search to page 2. */
  fetching?: boolean;
  onLoadMore: () => void; noun?: string; className?: string;
}) {
  const end = useRef<HTMLDivElement>(null);
  const load = useRef(onLoadMore);
  load.current = onLoadMore;

  useEffect(() => {
    const el = end.current;
    if (!el || !hasMore || loading || fetching || typeof IntersectionObserver === "undefined") return;
    // A fresh observer after every page reports straight away whether the end is still in reach, so a short page
    // that doesn't fill the screen keeps loading until it does.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        load.current();
      }
    }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, fetching, shown]);

  if (!total) return null;
  return (
    <div ref={end} className={cn("flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground", className)}>
      {hasMore && loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      <p className="tabular" aria-live="polite">
        {hasMore && loading ? "Loading more… " : ""}Showing {shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} {noun}
      </p>
    </div>
  );
}
