import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Save, Trash2, RotateCcw, ArrowRight } from "lucide-react";
import { snapshotQuery, rowsQuery } from "@/lib/queries";
import { BASELINE, forecast, remainingEur, daysOverdue, type ScenarioParams } from "@/lib/analytics";
import { recommendActions } from "@/lib/ai.functions";
import { deleteRow, queueApproval, saveScenario } from "@/lib/app.functions";
import { eur, compactEur } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Btn, Kpi, PageHeader, Panel, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/what-if")({
  head: () => ({
    meta: [
      { title: "What-if cockpit — Flow Cockpit" },
      { name: "description", content: "Stress-test your cash: late payers, revenue drops, one-off costs and new hires." },
      { property: "og:title", content: "What-if cockpit — Flow Cockpit" },
      { property: "og:description", content: "Stress-test your cash: late payers, revenue drops, one-off costs and new hires." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("scenarios"))]),
  component: WhatIf,
});

const SLIDERS: { key: keyof ScenarioParams; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "delayDays", label: "Delay all collections", min: 0, max: 60, step: 1, fmt: (v) => `${v} days` },
  { key: "revenueDropPct", label: "Immediate revenue drop", min: 0, max: 60, step: 5, fmt: (v) => `${v}%` },
  { key: "topLateCount", label: "Top customers pay late", min: 0, max: 5, step: 1, fmt: (v) => `top ${v}` },
  { key: "topLateDays", label: "…by", min: 0, max: 90, step: 5, fmt: (v) => `${v} days` },
  { key: "oneOffAmount", label: "One-off expense", min: 0, max: 100000, step: 2500, fmt: (v) => eur(v) },
  { key: "oneOffWeek", label: "…in week", min: 0, max: 11, step: 1, fmt: (v) => `W${v + 1}` },
  { key: "hires", label: "New hires", min: 0, max: 6, step: 1, fmt: (v) => `${v}` },
  { key: "hireMonthlyCost", label: "…monthly cost each", min: 2000, max: 15000, step: 500, fmt: (v) => eur(v) },
  { key: "hireStartWeek", label: "…starting week", min: 0, max: 11, step: 1, fmt: (v) => `W${v + 1}` },
];

const PRESETS: { label: string; params: Partial<ScenarioParams> }[] = [
  { label: "Top 3 customers pay 30 days late", params: { topLateCount: 3, topLateDays: 30 } },
  { label: "Revenue drops 15%", params: { revenueDropPct: 15 } },
  { label: "Hire 2 people", params: { hires: 2 } },
];

function WhatIfChart({ base, scen }: { base: { label: string; balance: number }[]; scen: { balance: number }[] }) {
  const data = base.map((w, k) => {
    const b = w.balance, sc = scen[k]?.balance ?? b;
    return { label: w.label, baseline: b, scenario: sc, gap: [Math.min(b, sc), Math.max(b, sc)] as [number, number] };
  });
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => compactEur(Number(v))} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={64} />
        <Tooltip formatter={(v, n) => (n === "gap" ? null : [eur(Number(v)), n === "baseline" ? "Baseline" : "Scenario"])} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Area dataKey="gap" stroke="none" fill="var(--warning)" fillOpacity={0.18} isAnimationActive={false} />
        <Line dataKey="baseline" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} />
        <Line dataKey="scenario" stroke="var(--warning)" strokeWidth={2.75} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function WhatIf() {
  const navigate = useNavigate();
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: saved } = useSuspenseQuery(rowsQuery("scenarios"));
  const qc = useQueryClient();
  const [p, setP] = useState<ScenarioParams>(BASELINE);
  const [name, setName] = useState("");
  const [recs, setRecs] = useState<{ title: string; reason: string; invoiceId: string | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => forecast(snap), [snap]);
  const scen = useMemo(() => forecast(snap, 12, p), [snap, p]);
  const delta = (scen.weeks.at(-1)?.balance ?? 0) - (base.weeks.at(-1)?.balance ?? 0);

  const describe = () => SLIDERS.filter((s) => p[s.key] !== BASELINE[s.key]).map((s) => `${s.label} ${s.fmt(p[s.key])}`).join(", ") || "baseline";

  async function recommend() {
    setBusy(true);
    try {
      const cands = snap.invoices.filter((i) => remainingEur(i) > 0 && i.state !== "DRAFT" && i.state !== "ARCHIVED").sort((a, b) => remainingEur(b) - remainingEur(a)).slice(0, 25)
        .map((i) => ({ id: i.id, customer: i.customer, number: i.number, eur: Math.round(remainingEur(i)), due: i.dueDate, daysOverdue: daysOverdue(i) }));
      const r = await recommendActions({ data: { scenario: describe(), forecast: JSON.stringify(scen.weeks.map((w) => ({ w: w.label, in: w.inflow, out: w.outflow, bal: w.balance }))), candidates: JSON.stringify(cands) } });
      setRecs(r.actions);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const end = scen.weeks.at(-1)?.balance ?? 0;
  const headline = scen.shortfall
    ? `In this scenario, cash goes negative in week ${scen.shortfall.week} (${compactEur(scen.shortfall.balance)}).`
    : `In this scenario, cash stays positive for all 12 weeks, ending at ${compactEur(end)}${delta ? ` (${delta < 0 ? "−" : "+"}${compactEur(Math.abs(delta))} vs baseline)` : ""}.`;
  const activePreset = PRESETS.findIndex((pr) => JSON.stringify({ ...BASELINE, ...pr.params }) === JSON.stringify(p));

  return (
    <div>
      <PageHeader eyebrow="What-if stress test" title="What happens if…"
        actions={<Btn variant="outline" onClick={() => { setP(BASELINE); setRecs(null); }}><RotateCcw className="h-3.5 w-3.5" />Reset</Btn>}>
        Built on the payment-velocity forecast. Light reports history; this models the future.
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((pr, k) => (
          <button key={pr.label} onClick={() => { setP({ ...BASELINE, ...pr.params }); setRecs(null); }}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", activePreset === k ? "border-warning bg-warning/15 text-foreground" : "border-border hover:bg-accent")}>
            {pr.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <Panel title="Levers">
          <div className="space-y-3">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{s.label}</span><span className="font-mono">{s.fmt(p[s.key])}</span></div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={p[s.key]} onChange={(e) => setP({ ...p, [s.key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--primary)]" />
              </label>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Baseline end" value={eur(base.weeks.at(-1)?.balance ?? 0)} />
            <Kpi label="Scenario end" value={eur(end)} tone={scen.shortfall ? "danger" : undefined} />
            <Kpi label="Difference" value={eur(delta)} tone={delta < 0 ? "danger" : delta > 0 ? "ok" : undefined} />
            <Kpi label="Goes negative" value={scen.shortfall ? `W${scen.shortfall.week}` : "never"} sub={scen.shortfall ? scen.shortfall.start : "within 12 weeks"} tone={scen.shortfall ? "danger" : "ok"} />
          </div>
          <div className="grid gap-4 2xl:grid-cols-[1fr_340px] lg:grid-cols-[1fr_300px]">
            <Panel title="Baseline vs scenario" right={<span className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-muted-foreground" />Baseline</span><span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-warning" />Scenario</span></span>}>
              <WhatIfChart base={base.weeks} scen={scen.weeks} />
              <p className={cn("mt-3 text-lg font-semibold tracking-tight", scen.shortfall ? "text-destructive" : "text-foreground")}>{headline}</p>
            </Panel>
            <Panel title="AI recommendations" right={<Btn onClick={recommend} disabled={busy}><Sparkles className="h-3.5 w-3.5" />{busy ? "Thinking…" : "Recommend"}</Btn>}>
              {!recs ? <p className="text-sm text-muted-foreground">Get three concrete actions for this scenario, each tied to a real customer you can work in Collections.</p> : (
                <ul className="space-y-2">
                  {recs.map((r, k) => (
                    <li key={k} className="rounded-md border border-border p-2.5">
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>
                      {r.invoiceId && snap.invoices.some((i) => i.id === r.invoiceId) ? (
                        <Btn variant="outline" className="mt-2" onClick={() => navigate({ to: "/collections", search: { focus: r.invoiceId! } })}>
                          Open {snap.invoices.find((i) => i.id === r.invoiceId)?.customer} in Collections<ArrowRight className="h-3.5 w-3.5" />
                        </Btn>
                      ) : (
                        <Btn variant="outline" className="mt-2" onClick={async () => {
                          await queueApproval({ data: { kind: "recommendation", source: "what-if", title: r.title, summary: `${r.reason} (scenario: ${describe()})`, payload: { scenario: p } } });
                          toast.success("Sent to approval queue"); qc.invalidateQueries({ queryKey: ["rows"] });
                        }}>Send to approval queue</Btn>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Saved scenarios">
              <div className="mb-3 flex gap-2">                <input className={`${inputCls} flex-1`} placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} />
                <Btn variant="outline" disabled={!name} onClick={async () => { await saveScenario({ data: { name, params: p } }); setName(""); qc.invalidateQueries({ queryKey: ["rows", "scenarios"] }); toast.success("Saved"); }}><Save className="h-3.5 w-3.5" />Save</Btn>
              </div>
              <ul className="space-y-1.5">
                {saved.map((s) => {
                  const f = forecast(snap, 12, { ...BASELINE, ...s.params });
                  return (
                    <li key={s.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                      <button className="flex-1 text-left font-medium hover:text-primary" onClick={() => setP({ ...BASELINE, ...s.params })}>{s.name}</button>
                      <span className={`font-mono text-xs ${f.shortfall ? "text-destructive" : "text-muted-foreground"}`}>{eur(f.weeks.at(-1)?.balance ?? 0)}</span>
                      <button aria-label="Delete scenario" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteRow({ data: { table: "scenarios", id: s.id } }); qc.invalidateQueries({ queryKey: ["rows", "scenarios"] }); }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  );
                })}
                {saved.length === 0 && <p className="text-xs text-muted-foreground">Save a scenario to compare end balances side by side.</p>}
              </ul>
            </Panel>
        </div>
      </div>
    </div>
  );
}
