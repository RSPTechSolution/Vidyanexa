"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, BellRing, BookCopy, BookOpen, IndianRupee, Library, Plus, Save, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { StatCard } from "@/components/common/stat-card";
import { useCan } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api/client";
import type { Book, BookIssue } from "@/lib/api/types";
import { formatDate, inr } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { useBook, useBookIssues, useBooks, useLibrarySettings, useLibraryStats } from "@/lib/queries";
import { cn } from "@/lib/utils";

const errText = (e: unknown, f: string) => (e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : f);
const COPY_TONE: Record<string, string> = {
  available: "bg-success/10 text-success", issued: "bg-primary/10 text-primary", damaged: "bg-warning/10 text-warning", lost: "bg-destructive/10 text-destructive", withdrawn: "bg-muted text-muted-foreground",
};

function BookDialog({ book, open, onOpenChange }: { book: Book | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", author: "", isbn: "", publisher: "", category: "", rack: "", copies: "1" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setF({ title: book?.title ?? "", author: book?.author ?? "", isbn: book?.isbn ?? "", publisher: book?.publisher ?? "", category: book?.category ?? "", rack: book?.rack ?? "", copies: book ? "0" : "1" });
    }
  }, [open, book]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])), title: f.title, copies: Number(f.copies) || 0 };
      return api(book ? `/library/books/${book.id}` : "/library/books", { method: book ? "PUT" : "POST", body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library"] }); toast.success(book ? "Book updated" : "Book added"); onOpenChange(false); },
    onError: (e) => setError(errText(e, "Could not save")),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{book ? "Edit book" : "Add a book"}</DialogTitle><DialogDescription>Each copy gets its own accession number automatically.</DialogDescription></DialogHeader>
        <form id="book-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Title" required className="sm:col-span-2">{(a) => <Input {...a} value={f.title} onChange={set("title")} maxLength={300} />}</Field>
          <Field label="Author">{(a) => <Input {...a} value={f.author} onChange={set("author")} />}</Field>
          <Field label="ISBN">{(a) => <Input {...a} value={f.isbn} onChange={set("isbn")} maxLength={20} />}</Field>
          <Field label="Publisher">{(a) => <Input {...a} value={f.publisher} onChange={set("publisher")} />}</Field>
          <Field label="Category">{(a) => <Input {...a} value={f.category} onChange={set("category")} placeholder="e.g. Fiction" />}</Field>
          <Field label="Rack">{(a) => <Input {...a} value={f.rack} onChange={set("rack")} placeholder="e.g. B-2" />}</Field>
          <Field label={book ? "Add more copies" : "Copies"}>{(a) => <Input {...a} type="number" min={0} max={500} value={f.copies} onChange={set("copies")} />}</Field>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="book-form" disabled={!f.title.trim()} loading={save.isPending}><Save aria-hidden />Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (b: Book) => void }) {
  const can = useCan();
  const q = useBook(id);
  const b = q.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{b?.title ?? "Book"}</SheetTitle><SheetDescription>{b ? [b.author, b.publisher, b.isbn && `ISBN ${b.isbn}`, b.rack && `Rack ${b.rack}`].filter(Boolean).join(" · ") : ""}</SheetDescription></SheetHeader>
        {!b ? <Skeleton className="m-4 h-48" /> : (
          <div className="space-y-3 px-4 pb-4">
            <p className="text-sm">{b.available} of {b.total} copies on the shelf</p>
            <ul className="divide-y rounded-xl border text-sm">
              {b.copies.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono">{c.accession_no}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", COPY_TONE[c.status])}>{c.status}</span>
                  {c.borrower && <span className="ml-auto text-right text-xs text-muted-foreground">{c.borrower}<span className="block">due {formatDate(c.due_on)}</span></span>}
                </li>
              ))}
            </ul>
            {can("library.manage") && <Button variant="outline" onClick={() => onEdit(b)}>Edit or add copies</Button>}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CatalogueTab() {
  const can = useCan();
  const [search, setSearch] = useState("");
  const q = useBooks(useDebounced(search.trim()));
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Book | null | undefined>(undefined);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-80 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, author, ISBN or accession no." className="h-9 pl-9" aria-label="Search books" />
        </div>
        {can("library.manage") && <Button className="ml-auto" onClick={() => setEditing(null)}><Plus aria-hidden />Add book</Button>}
      </div>
      {q.isLoading ? <Skeleton className="h-64 rounded-xl" /> : !q.data?.length ? (
        <EmptyState className="rounded-2xl border bg-card" illustration={<Library className="size-12 text-muted-foreground/60" aria-hidden />} title={search ? "No books match" : "No books yet"} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Books</caption>
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th scope="col" className="px-4 py-2">Title</th><th scope="col" className="px-2 py-2">Category</th><th scope="col" className="px-2 py-2">Rack</th><th scope="col" className="px-2 py-2 text-right">On shelf</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {q.data.map((b) => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2"><span className="font-medium">{b.title}</span><span className="block text-xs text-muted-foreground">{b.author ?? "—"}</span></td>
                  <td className="px-2 py-2">{b.category ?? "—"}</td>
                  <td className="px-2 py-2">{b.rack ?? "—"}</td>
                  <td className={cn("px-2 py-2 text-right tabular", b.available === 0 && "text-warning")}>{b.available} / {b.total}</td>
                  <td className="px-2 py-1 text-right"><Button variant="ghost" size="sm" onClick={() => setOpen(b.id)}>Copies</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BookSheet id={open} onClose={() => setOpen(null)} onEdit={(b) => { setOpen(null); setEditing(b); }} />
      <BookDialog book={editing ?? null} open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} />
    </>
  );
}

function IssueReturn() {
  const qc = useQueryClient();
  const [acc, setAcc] = useState("");
  const [borrower, setBorrower] = useState("");
  const [racc, setRacc] = useState("");
  const [paid, setPaid] = useState(false);
  const [condition, setCondition] = useState("ok");
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["library"] }); toast.success(msg); };
  const issue = useMutation({
    mutationFn: () => api<BookIssue>("/library/issue", { method: "POST", body: { accession_no: acc.trim(), borrower: borrower.trim() } }),
    onSuccess: ({ data }) => { done(`Issued "${data.title}" to ${data.borrower}, due ${formatDate(data.due_on)}`); setAcc(""); setBorrower(""); },
    onError: (e) => toast.error(errText(e, "Could not issue")),
  });
  const ret = useMutation({
    mutationFn: () => api<BookIssue>("/library/return", { method: "POST", body: { accession_no: racc.trim(), fine_paid: paid, condition } }),
    onSuccess: ({ data }) => { done(data.fine > 0 ? `Returned. Fine ${inr(data.fine)}${data.fine_paid ? " collected" : " still due"}` : "Returned on time"); setRacc(""); setPaid(false); setCondition("ok"); },
    onError: (e) => toast.error(errText(e, "Could not return")),
  });
  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-2">
      <form className="rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><ArrowUpFromLine className="size-4" aria-hidden />Issue a book</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Accession no.">{(a) => <Input {...a} value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="00012" />}</Field>
          <Field label="Borrower" hint="Admission no., or staff email / employee ID">{(a) => <Input {...a} value={borrower} onChange={(e) => setBorrower(e.target.value)} />}</Field>
        </div>
        <Button type="submit" className="mt-3" disabled={!acc.trim() || !borrower.trim()} loading={issue.isPending}>Issue</Button>
      </form>
      <form className="rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); ret.mutate(); }}>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><ArrowDownToLine className="size-4" aria-hidden />Return a book</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Accession no. (return)">{(a) => <Input {...a} value={racc} onChange={(e) => setRacc(e.target.value)} placeholder="00012" />}</Field>
          <Field label="Condition">
            {(a) => (
              <Select value={condition} onValueChange={(v) => setCondition(String(v))}>
                <SelectTrigger id={a.id} className="w-full"><SelectValue>{{ ok: "Fine", damaged: "Damaged", lost: "Lost" }[condition]}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="ok">Fine</SelectItem><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="lost">Lost</SelectItem></SelectContent>
              </Select>
            )}
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><Switch checked={paid} onCheckedChange={setPaid} />Late fine collected now</label>
        <Button type="submit" className="mt-3" disabled={!racc.trim()} loading={ret.isPending}>Return</Button>
      </form>
    </div>
  );
}

function CirculationTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useBookIssues(status);
  const paid = useMutation({
    mutationFn: (id: string) => api(`/library/issues/${id}/fine-paid`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library"] }); toast.success("Fine marked as paid"); },
  });
  const remind = useMutation({
    mutationFn: () => api<{ message: string }>("/library/remind-overdue", { method: "POST" }),
    onSuccess: ({ data }) => toast.success(data.message),
  });
  return (
    <>
      <IssueReturn />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={status} onValueChange={(v) => setStatus(String(v))}>
          <TabsList><TabsTrigger value="open">Issued</TabsTrigger><TabsTrigger value="overdue">Overdue</TabsTrigger><TabsTrigger value="fines">Fines due</TabsTrigger><TabsTrigger value="all">History</TabsTrigger></TabsList>
        </Tabs>
        <Button variant="outline" className="ml-auto" onClick={() => remind.mutate()} loading={remind.isPending}><BellRing aria-hidden />Remind overdue</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-48 rounded-xl" /> : !q.data?.length ? <EmptyState className="rounded-2xl border bg-card" title="Nothing here" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Issued books</caption>
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th scope="col" className="px-4 py-2">Book</th><th scope="col" className="px-2 py-2">Borrower</th><th scope="col" className="px-2 py-2">Issued</th><th scope="col" className="px-2 py-2">Due</th><th scope="col" className="px-2 py-2 text-right">Fine</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {q.data.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-2"><span className="font-medium">{i.title}</span><span className="block font-mono text-xs text-muted-foreground">{i.accession_no}</span></td>
                  <td className="px-2 py-2">{i.borrower}<span className="block text-xs text-muted-foreground">{i.class_section ?? "Staff"}</span></td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate(i.issued_on)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{i.returned_on ? <span className="text-muted-foreground">Returned {formatDate(i.returned_on)}</span> : formatDate(i.due_on)}{i.overdue_days > 0 && !i.returned_on && <span className="block text-xs font-semibold text-destructive">{i.overdue_days} days late</span>}</td>
                  <td className="px-2 py-2 text-right tabular">{i.fine > 0 ? inr(i.fine) : "—"}{i.fine > 0 && <span className={cn("block text-xs", i.fine_paid ? "text-success" : "text-warning")}>{i.fine_paid ? "Paid" : "Due"}</span>}</td>
                  <td className="px-2 py-1 text-right">{i.returned_on && i.fine > 0 && !i.fine_paid && <Button size="sm" variant="outline" onClick={() => paid.mutate(i.id)}><IndianRupee aria-hidden />Paid</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const q = useLibrarySettings();
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v)]))); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api("/library/settings", { method: "PUT", body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library"] }); toast.success("Library rules saved"); },
    onError: (e) => toast.error(errText(e, "Could not save")),
  });
  if (!q.data) return <Skeleton className="h-40" />;
  const num = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}>{(a) => <Input {...a} type="number" min={0} value={f[k] ?? ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />}</Field>;
  // An example of the rules as they stand, so the office can see what a late return costs before saving.
  const perDay = Number(f.fine_per_day || 0), grace = Number(f.grace_days || 0), cap = Number(f.max_fine || 0);
  const example = (days: number) => { const fine = days <= grace ? 0 : perDay * (days - grace); return cap > 0 ? Math.min(fine, cap) : fine; };
  return (
    <form className="max-w-2xl rounded-2xl border bg-card p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <p className="mb-4 text-sm text-muted-foreground">Your school&apos;s own rules. A book is overdue the day after its due date; the fine grows each day it&apos;s kept and stops when it&apos;s returned.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("loan_days", "Loan period (days)", "How long a book can be kept")}
        {num("fine_per_day", "Late fine per day (₹)", "0 for no fines")}
        {num("grace_days", "Grace period (days)", "Late days that are free")}
        {num("max_fine", "Most fine per book (₹)", "0 for no limit")}
        {num("max_books_student", "Books a student can hold")}
        {num("max_books_staff", "Books a staff member can hold")}
      </div>
      <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">
        With these rules a book returned <b>3 days</b> late costs <b>₹{example(3)}</b>, and <b>10 days</b> late <b>₹{example(10)}</b>.
      </p>
      <Button type="submit" className="mt-4" loading={save.isPending}><Save aria-hidden />Save rules</Button>
    </form>
  );
}

function LibraryPage() {
  const can = useCan();
  const manage = can("library.manage");
  const [tab, setTab] = useState(useSearchParams().get("tab") ?? (manage ? "circulation" : "catalogue"));
  const stats = useLibraryStats();
  const s = stats.data;
  return (
    <>
      <PageHeader title="Library" description="Catalogue, issue and return, overdue reminders and late fines." />
      {manage && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Titles" value={s?.titles ?? 0} hint={`${s?.copies ?? 0} copies`} icon={BookOpen} loading={stats.isLoading} />
          <StatCard label="Issued now" value={s?.issued ?? 0} icon={BookCopy} accent="info" loading={stats.isLoading} />
          <StatCard label="Overdue" value={s?.overdue ?? 0} icon={AlarmClock} accent={s?.overdue ? "danger" : "success"} loading={stats.isLoading} />
          <StatCard label="Fines due" value={s ? inr(s.fines_due) : "—"} icon={IndianRupee} accent="warning" loading={stats.isLoading} />
        </div>
      )}
      {manage && (
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="mb-5">
          <TabsList><TabsTrigger value="circulation">Issue and return</TabsTrigger><TabsTrigger value="catalogue">Catalogue</TabsTrigger><TabsTrigger value="settings">Rules</TabsTrigger></TabsList>
        </Tabs>
      )}
      {(tab === "catalogue" || !manage) && <CatalogueTab />}
      {manage && tab === "circulation" && <CirculationTab />}
      {manage && tab === "settings" && <SettingsTab />}
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="library.view"><Suspense><LibraryPage /></Suspense></PermissionGate>;
}
