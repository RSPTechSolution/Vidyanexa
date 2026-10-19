"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, SendHorizonal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { PermissionGate } from "@/components/common/permission-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import type { AiAnswer } from "@/lib/api/types";
import { useAiStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Turn = { id: number; question: string; answer?: AiAnswer; error?: string };

function Answer({ a, onAsk }: { a: AiAnswer; onAsk: (q: string) => void }) {
  const draft = a.template === "draft_notice" ? String(a.rows[0]?.[0] ?? "") : null;
  const facts = a.columns.length === 2 && a.columns.every((c) => c === "");
  return (
    <div className="space-y-3">
      <p className="font-medium">{a.text}</p>
      {draft != null && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm whitespace-pre-line">{draft}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => navigator.clipboard.writeText(draft).then(() => toast.success("Copied"))}><Copy aria-hidden />Copy</Button>
        </div>
      )}
      {draft == null && a.rows.length > 0 && (facts ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {a.rows.map((r) => <div key={String(r[0])} className="contents"><dt className="text-muted-foreground">{r[0]}</dt><dd className="font-medium">{r[1]}</dd></div>)}
        </dl>
      ) : (
        <div className="max-h-96 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground">{a.columns.map((c) => <th key={c} scope="col" className="px-3 py-2">{c}</th>)}</tr></thead>
            <tbody>{a.rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((v, j) => <td key={j} className="px-3 py-1.5">{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
      {a.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">{a.suggestions.map((s) => <button key={s} type="button" onClick={() => onAsk(s)} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">{s}</button>)}</div>
      )}
      {a.link && <Link href={a.link} className={buttonVariants({ variant: "ghost", size: "sm" })}>Open the page<ArrowRight aria-hidden /></Link>}
    </div>
  );
}

function Assistant() {
  const qc = useQueryClient();
  const status = useAiStatus();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);
  const ask = useMutation({
    mutationFn: async (question: string) => (await api<AiAnswer>("/ai/ask", { method: "POST", body: { question } })).data,
    onMutate: (question) => { const id = Date.now(); setTurns((t) => [...t, { id, question }]); setQ(""); return { id }; },
    onSuccess: (answer, _, ctx) => setTurns((t) => t.map((x) => (x.id === ctx?.id ? { ...x, answer } : x))),
    onError: (e, _, ctx) => setTurns((t) => t.map((x) => (x.id === ctx?.id ? { ...x, error: e instanceof ApiError ? e.message : "Something went wrong" } : x))),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai"] }),
  });
  const send = (text: string) => { if (text.trim().length >= 3 && !ask.isPending) ask.mutate(text.trim()); };
  const s = status.data;
  return (
    <>
      <PageHeader title="AI assistant" description="Ask about your school in plain words. Answers come from your school's own records, and only what your role may see." />
      <div className="mx-auto max-w-3xl">
        {!turns.length && (
          <section className="mb-6 rounded-2xl border bg-card p-5">
            <p className="mb-3 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" aria-hidden />Try asking</p>
            {!s ? <Skeleton className="h-20" /> : (
              <div className="flex flex-wrap gap-2">{s.templates.map((t) => <button key={t.id} type="button" onClick={() => send(t.example)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted">{t.example}</button>)}</div>
            )}
          </section>
        )}
        <ol className="space-y-5" aria-live="polite">
          {turns.map((t) => (
            <li key={t.id} className="space-y-3">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">{t.question}</p>
              <div className={cn("rounded-2xl rounded-bl-sm border bg-card p-4", t.error && "border-destructive/40")}>
                {t.answer ? <Answer a={t.answer} onAsk={send} /> : t.error ? <p className="text-sm text-destructive">{t.error}</p> : <Skeleton className="h-6 w-48" />}
              </div>
            </li>
          ))}
        </ol>
        <div ref={end} />
        <form className="sticky bottom-4 mt-6 flex gap-2 rounded-2xl border bg-card p-2 shadow-sm" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Who is absent today in Class 5?" aria-label="Your question" maxLength={500} className="border-0 shadow-none focus-visible:ring-0" />
          <Button type="submit" disabled={q.trim().length < 3} loading={ask.isPending}><SendHorizonal aria-hidden />Ask</Button>
        </form>
        {s && <p className="mt-2 text-center text-xs text-muted-foreground">{s.mode === "ai" ? `Understands free-form questions with ${s.provider === "gemini" ? "Gemini" : s.provider === "claude" ? "Claude" : "AI"}.` : "Answers set questions; add an AI key to understand free-form questions."} {s.left_today} questions left today.</p>}
      </div>
    </>
  );
}

export default function Page() {
  return <PermissionGate permission="ai.use"><Assistant /></PermissionGate>;
}
