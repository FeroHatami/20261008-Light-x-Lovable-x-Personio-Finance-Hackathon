import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { snapshotQuery } from "@/lib/queries";
import { askFinances } from "@/lib/ai.functions";
import { computeVelocity, daysOverdue, forecast, remainingEur, startingCash } from "@/lib/analytics";
import { PageHeader, Panel } from "@/components/ui-kit";
import { eur } from "@/lib/types";

type Table = { cols: string[]; rows: (string | number)[][]; bar?: number; total?: string };

function DataTable({ t }: { t: Table }) {
  const max = t.bar != null ? Math.max(1, ...t.rows.map((r) => Math.abs(Number(r[t.bar!] ?? 0) || 0))) : 1;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground"><tr>{t.cols.map((c) => <th key={c} className="px-2.5 py-1.5 text-left font-medium">{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, k) => (
          <tr key={k} className="border-t border-border">{r.map((v, j) => (
            <td key={j} className="px-2.5 py-1.5 font-mono">
              {t.bar === j ? <div className="flex items-center gap-2"><div className="h-2 rounded bg-primary" style={{ width: `${Math.max(4, (Math.abs(Number(v)) / max) * 90)}px` }} /><span>{typeof v === "number" && j !== 0 && t.cols[j]?.includes("€") ? eur(v) : v}</span></div> : typeof v === "number" && t.cols[j]?.includes("€") ? eur(v) : v}
            </td>))}</tr>))}
        </tbody>
      </table>
      {t.total && <p className="border-t border-border px-2.5 py-1.5 text-xs font-medium">{t.total}</p>}
    </div>
  );
}

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: "Ask your finances — Flow Cockpit" },
      { name: "description", content: "Ask plain-language questions about your live Light data." },
      { property: "og:title", content: "Ask your finances — Flow Cockpit" },
      { property: "og:description", content: "Ask plain-language questions about your live Light data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(snapshotQuery),
  component: Ask,
});

const SUGGEST = ["Who are my 5 slowest-paying customers?", "How much is overdue more than 60 days?", "What cash do I expect in the next 4 weeks?", "Which draft invoices should I send first?"] as const;

function Ask() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; text: string; table?: Table }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const context = useMemo(() => {
    const fc = forecast(snap);
    return JSON.stringify({
      today: new Date().toISOString().slice(0, 10),
      invoices: snap.invoices.map((i) => ({ c: i.customer, n: i.number, s: i.state, eur: Math.round(i.amountEur), rem: Math.round(remainingEur(i)), cur: i.currency, inv: i.invoiceDate, due: i.dueDate, od: daysOverdue(i), paid: i.lastPaymentDate })),
      velocity: computeVelocity(snap.invoices).rows.map((r) => ({ c: r.customer, late: r.avgDaysLate, sd: r.stdev, rel: r.reliability, open: Math.round(r.openEur) })),
      forecastWeeks: fc.weeks, settings: { ...snap.settings, starting_cash: startingCash(snap), starting_cash_note: "Editable assumption; sandbox ledger has no opening balance" },
      expenses: snap.expenses, purchaseOrders: snap.purchaseOrders, products: snap.products.map((p) => p.name),
      unavailable: snap.unavailable,
    });
  }, [snap]);

  const tables = useMemo((): Record<string, Table> => {
    const vel = computeVelocity(snap.invoices).rows.filter((r) => r.avgDaysLate != null).sort((a, b) => (b.avgDaysLate ?? 0) - (a.avgDaysLate ?? 0)).slice(0, 5);
    const od = snap.invoices.filter((i) => remainingEur(i) > 0 && daysOverdue(i) > 60).sort((a, b) => remainingEur(b) - remainingEur(a));
    const fc = forecast(snap).weeks.slice(0, 4);
    const drafts = snap.invoices.filter((i) => i.state === "DRAFT").sort((a, b) => b.amountEur - a.amountEur).slice(0, 8);
    return {
      [SUGGEST[0]]: { cols: ["Customer", "Avg days late", "Open €"], rows: vel.map((r) => [r.customer, r.avgDaysLate ?? 0, Math.round(r.openEur)]), bar: 1 },
      [SUGGEST[1]]: { cols: ["Customer", "Invoice", "Days overdue", "Open €"], rows: od.slice(0, 10).map((i) => [i.customer, i.number ?? "—", daysOverdue(i), Math.round(remainingEur(i))]), bar: 3, total: `Total: ${eur(od.reduce((a, i) => a + remainingEur(i), 0))} across ${od.length} invoices${od.length > 10 ? " (top 10 shown)" : ""}` },
      [SUGGEST[2]]: { cols: ["Week", "Expected inflow €", "Balance €"], rows: fc.map((w) => [w.label, Math.round(w.inflow), Math.round(w.balance)]), bar: 1, total: `Total expected inflow: ${eur(fc.reduce((a, w) => a + w.inflow, 0))}` },
      [SUGGEST[3]]: { cols: ["Customer", "Draft €", "Created"], rows: drafts.map((i) => [i.customer, Math.round(i.amountEur), i.createdAt.slice(0, 10)]), bar: 1 },
    };
  }, [snap]);
  const example = useMemo(() => [...snap.invoices].sort((a, b) => remainingEur(b) - remainingEur(a))[0]?.customer, [snap]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: "user", text }]); setQ(""); setBusy(true);
    try {
      const table: Table | undefined = tables[text];
      const ctx = table ? `${context}\nEXACT PRECOMPUTED ANSWER TABLE (shown to the user below your text; your numbers must match it, don't repeat the table): ${JSON.stringify(table)}` : context;
      const r = await askFinances({ data: { question: text, context: ctx.slice(0, 60000), history } });
      setMsgs((m) => [...m, { role: "assistant" as const, text: r.answer, ...(table ? { table } : {}) }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `⚠️ ${(e as Error).message}` }]);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }

  return (
    <div>
      <PageHeader eyebrow="Ask your finances" title="Ask in plain language">Answers come only from your live Light data loaded in this session.</PageHeader>
      <Panel className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pb-4">
          {msgs.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGEST.map((s) => (
                <button key={s} onClick={() => send(s)} className="flex items-center gap-2 rounded-md border border-border p-3 text-left text-sm hover:bg-accent"><Sparkles className="h-3.5 w-3.5 text-primary" />{s}</button>
              ))}
            </div>
          )}
          {msgs.map((m, k) => (
            <div key={k} className={m.role === "user" ? "ml-auto max-w-[75%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"}>{m.role === "user" ? m.text : m.text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}{m.table && (m.table.rows.length ? <DataTable t={m.table} /> : <p className="mt-2 text-xs text-muted-foreground">No matching invoices right now.</p>)}</div>
          ))}
          {busy && <div className="w-fit animate-pulse rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Analysing…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t border-border pt-3">
          <input className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" placeholder={example ? `e.g. How much does ${example} owe and how late do they usually pay?` : "Ask about invoices, customers or cash"} value={q} onChange={(e) => setQ(e.target.value)} />
          <button disabled={busy || !q.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" />Ask</button>
        </form>
      </Panel>
    </div>
  );
}
