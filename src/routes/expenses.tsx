import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, Trash2 } from "lucide-react";
import { rowsQuery, snapshotQuery } from "@/lib/queries";
import { analyzeReceipt } from "@/lib/ai.functions";
import { deleteRow, saveExpenseCheck } from "@/lib/app.functions";
import { nextTaxDeadline, daysBetween } from "@/lib/analytics";
import { eur, money } from "@/lib/types";
import { Btn, Kpi, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expense & tax checker — Flow Cockpit" },
      { name: "description", content: "Check receipts against Light expenses, flag missing or duplicate ones, and see quarterly deductions." },
      { property: "og:title", content: "Expense & tax checker — Flow Cockpit" },
      { property: "og:description", content: "Check receipts against Light expenses, flag missing or duplicate ones, and see quarterly deductions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("expense_checks"))]),
  component: Expenses,
});

const SAMPLE = "Your booking is confirmed — SAS Scandinavian Airlines. Flight SK1415 Copenhagen → Berlin, 12 Sep 2026. Passenger: Ana Ruiz. Total paid: DKK 1,890.00 incl. taxes. Purpose: client workshop.";

function Expenses() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: checks } = useSuspenseQuery(rowsQuery("expense_checks"));
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [country, setCountry] = useState("Denmark");
  const [busy, setBusy] = useState(false);

  const q = useMemo(() => {
    const d = new Date(); const qn = Math.floor(d.getUTCMonth() / 3);
    const start = new Date(Date.UTC(d.getUTCFullYear(), qn * 3, 1)).toISOString().slice(0, 10);
    return { label: `Q${qn + 1} ${d.getUTCFullYear()}`, start };
  }, []);
  const inQ = checks.filter((c) => (c.expense_date ?? c.created_at.slice(0, 10)) >= q.start);
  const deductibleQ = inQ.filter((c) => c.deductible).reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const deadline = nextTaxDeadline();

  async function check() {
    setBusy(true);
    try {
      const r = await analyzeReceipt({ data: { text, country } });
      // Match against Light expenses (same currency, amount within 1%, date within 5 days) and against earlier checks for duplicates.
      const match = snap.expenses.find((e) => r.amount != null && e.currency === r.currency && Math.abs(e.amount - r.amount) <= Math.max(1, r.amount * 0.01) && (!r.date || !e.date || Math.abs(daysBetween(e.date, r.date)) <= 5));
      const dup = checks.find((c) => c.amount != null && Number(c.amount) === r.amount && c.vendor === r.vendor && c.expense_date === r.date);
      const status = dup ? "duplicate" : match ? "matched" : "missing_in_light";
      await saveExpenseCheck({ data: { source_text: text.slice(0, 5000), vendor: r.vendor, expense_date: r.date, amount: r.amount, currency: r.currency, category: r.category, deductible: r.deductible, deductible_reason: r.reason, matched_expense_id: match?.id ?? null, match_status: status } });
      setText(""); qc.invalidateQueries({ queryKey: ["rows", "expense_checks"] });
      toast.success(status === "matched" ? "Matched to a Light expense" : status === "duplicate" ? "Looks like a duplicate" : "Not found in Light — flagged");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader eyebrow="Expense & tax checker" title="Receipts, deductions and the quarterly view">
        Paste or upload receipts and booking emails. The AI extracts and categorises them, checks them against {snap.expenses.length} expenses in Light, and flags missing receipts and duplicates. Inbox connection isn't set up yet — this works upload-first. Suggestions, not tax advice.
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Deductible ${q.label}`} value={eur(deductibleQ)} sub="mixed currencies shown as entered" tone="ok" />
        <Kpi label="Missing in Light" value={checks.filter((c) => c.match_status === "missing_in_light").length} tone="warn" />
        <Kpi label="Duplicates" value={checks.filter((c) => c.match_status === "duplicate").length} tone="danger" />
        <Kpi label="Filing deadline" value={deadline} sub="quarterly VAT · confirm locally" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Check a receipt" right={<button className="text-xs text-primary underline" onClick={() => setText(SAMPLE)}>Use example</button>}>
          <textarea className="min-h-48 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Paste receipt or booking email…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent">
              <Upload className="h-3.5 w-3.5" />Upload
              <input type="file" accept=".txt,.eml,.pdf" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                if (f.type === "application/pdf") { const { extractPdfText } = await import("@/lib/pdf-text"); setText(await extractPdfText(f)); } else setText(await f.text());
              }} />
            </label>
            <select className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Tax country">
              {["Denmark", "Germany", "Spain", "France", "Netherlands", "United Kingdom", "United States"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <Btn disabled={busy || text.trim().length < 3} onClick={check}><Sparkles className="h-3.5 w-3.5" />{busy ? "Checking…" : "Check"}</Btn>
          </div>
        </Panel>
        <Panel title="Checked evidence">
          <div className="divide-y divide-border">
            {checks.map((c) => (
              <div key={c.id} className="flex items-start gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.vendor ?? "Unknown vendor"} <span className="text-xs font-normal text-muted-foreground">{c.expense_date ?? ""} · {c.category}</span></p>
                  <p className="text-xs text-muted-foreground">{c.deductible ? "Likely deductible" : "Likely not deductible"} — {c.deductible_reason}</p>
                </div>
                <span className="font-mono text-xs">{c.amount != null && c.currency ? money(Number(c.amount), c.currency) : "—"}</span>
                <Pill tone={c.match_status === "matched" ? "ok" : c.match_status === "duplicate" ? "danger" : "warn"}>{c.match_status.replace(/_/g, " ")}</Pill>
                <button aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteRow({ data: { table: "expense_checks", id: c.id } }); qc.invalidateQueries({ queryKey: ["rows", "expense_checks"] }); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {checks.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No receipts checked yet.</p>}
          </div>
        </Panel>
      </div>
      <Panel title="Expenses in Light" className="mt-4">
        <div className="divide-y divide-border">
          {snap.expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{e.description || "Expense"} <span className="text-xs text-muted-foreground">{e.date}</span></span>
              <Pill>{e.status.toLowerCase().replace(/_/g, " ")}</Pill>
              <span className="font-mono text-xs">{money(e.amount, e.currency)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
