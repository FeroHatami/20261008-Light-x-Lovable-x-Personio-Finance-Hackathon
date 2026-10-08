import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, AlertTriangle, Trash2, Plus } from "lucide-react";
import { snapshotQuery } from "@/lib/queries";
import { extractInvoice, type Extracted } from "@/lib/ai.functions";
import { queueApproval } from "@/lib/app.functions";
import { money } from "@/lib/types";
import { Btn, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/new-invoice")({
  head: () => ({
    meta: [
      { title: "Invoice from anything — Flow Cockpit" },
      { name: "description", content: "Paste an email, a note or a contract and get a draft invoice for Light." },
      { property: "og:title", content: "Invoice from anything — Flow Cockpit" },
      { property: "og:description", content: "Paste an email, a note or a contract and get a draft invoice for Light." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(snapshotQuery),
  component: NewInvoice,
});

const EXAMPLE = "Hi team, please bill AeroRoute Corporate Travel for March: 40 hours of consulting at €120/hour plus a one-off setup fee of €500. Payment terms 14 days. Thanks, Ana";

function NewInvoice() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<(Extracted & { customerId: string | null }) | null>(null);

  async function onFile(f: File) {
    if (f.type === "application/pdf") {
      try {
        const { extractPdfText } = await import("@/lib/pdf-text");
        setText(await extractPdfText(f));
      } catch { toast.error("Couldn't read that PDF. Paste the text instead."); }
    } else setText(await f.text());
  }

  async function extract() {
    setBusy(true);
    try {
      const r = await extractInvoice({ data: { text, customers: snap.customers.map((c) => c.name) } });
      const match = snap.customers.find((c) => c.name.toLowerCase() === (r.customerName ?? "").toLowerCase());
      const missing = [...r.missing];
      if (!match) missing.unshift(r.customerName ? `Customer "${r.customerName}" not found in Light — pick one` : "Customer");
      setDraft({ ...r, missing, customerId: match?.id ?? null, currency: r.currency ?? null });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const total = draft?.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) ?? 0;
  const ready = draft && draft.customerId && draft.currency && draft.lines.length > 0 && draft.lines.every((l) => l.quantity > 0 && l.unitPrice > 0);

  async function queue() {
    if (!draft || !ready) return;
    const customer = snap.customers.find((c) => c.id === draft.customerId)!;
    await queueApproval({ data: { kind: "draft_invoice", source: "invoice-from-anything", title: `Draft invoice — ${customer.name}`, summary: `${money(total, draft.currency!)} net · ${draft.lines.length} lines`,
      payload: { customerId: customer.id, customer: customer.name, currency: draft.currency, invoiceDate: draft.invoiceDate, netTerms: draft.netTerms ?? 30, description: draft.description, lines: draft.lines } } });
    toast.success("Draft sent to approval queue");
    setDraft(null); setText("");
    qc.invalidateQueries({ queryKey: ["rows"] });
  }

  return (
    <div>
      <PageHeader eyebrow="Invoice from anything" title="Turn any text into a draft invoice">
        Paste an email, a purchase order or a quick note — or upload a text/PDF file. The AI fills what it can and flags what's missing instead of guessing.
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Source" right={<button className="text-xs text-primary underline" onClick={() => setText(EXAMPLE)}>Use example</button>}>
          <textarea className="min-h-64 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="bill Acme 40 hours at €120…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent">
              <Upload className="h-3.5 w-3.5" />Upload file
              <input type="file" accept=".txt,.eml,.md,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <Btn onClick={extract} disabled={busy || text.trim().length < 3}><Sparkles className="h-3.5 w-3.5" />{busy ? "Reading…" : "Extract draft"}</Btn>
          </div>
        </Panel>
        <Panel title="Draft for review">
          {!draft ? <p className="text-sm text-muted-foreground">The extracted draft appears here.</p> : (
            <div className="space-y-3 text-sm">
              {draft.missing.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                  <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5 text-warning" />Missing or unclear</p>
                  <ul className="list-disc pl-5">{draft.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2"><span className="text-xs text-muted-foreground">Customer (from Light)</span>
                  <select className={`${inputCls} mt-1 w-full`} value={draft.customerId ?? ""} onChange={(e) => setDraft({ ...draft, customerId: e.target.value || null })}>
                    <option value="">— choose —</option>
                    {snap.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></label>
                <label><span className="text-xs text-muted-foreground">Currency</span>
                  <input className={`${inputCls} mt-1 w-full`} value={draft.currency ?? ""} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })} /></label>
                <label><span className="text-xs text-muted-foreground">Terms (days)</span>
                  <input type="number" className={`${inputCls} mt-1 w-full`} value={draft.netTerms ?? 30} onChange={(e) => setDraft({ ...draft, netTerms: Number(e.target.value) })} /></label>
                <label className="col-span-2"><span className="text-xs text-muted-foreground">Description</span>
                  <input className={`${inputCls} mt-1 w-full`} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Lines (net)</p>
                {draft.lines.map((l, k) => (
                  <div key={k} className="mb-1.5 flex gap-1.5">
                    <input className={`${inputCls} flex-1`} value={l.description} onChange={(e) => { const lines = [...draft.lines]; lines[k] = { ...l, description: e.target.value }; setDraft({ ...draft, lines }); }} />
                    <input type="number" className={`${inputCls} w-16`} value={l.quantity} onChange={(e) => { const lines = [...draft.lines]; lines[k] = { ...l, quantity: Number(e.target.value) }; setDraft({ ...draft, lines }); }} />
                    <input type="number" className={`${inputCls} w-24`} value={l.unitPrice} onChange={(e) => { const lines = [...draft.lines]; lines[k] = { ...l, unitPrice: Number(e.target.value) }; setDraft({ ...draft, lines }); }} />
                    <button aria-label="Remove line" className="px-1 text-muted-foreground hover:text-destructive" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== k) })}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button className="inline-flex items-center gap-1 text-xs text-primary" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { description: "", quantity: 1, unitPrice: 0 }] })}><Plus className="h-3 w-3" />Add line</button>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-mono">{draft.currency ? money(total, draft.currency) : total.toFixed(2)} net</span>
                <div className="flex items-center gap-2">
                  {!ready && <Pill tone="warn">complete the fields</Pill>}
                  <Btn disabled={!ready} onClick={queue}>Send to approval queue</Btn>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">On approval it's created in Light as a <b>draft</b>. Opening and sending it stays in Light. <Link to="/approvals" className="underline">Queue →</Link></p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
