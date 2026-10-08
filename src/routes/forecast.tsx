import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { snapshotQuery } from "@/lib/queries";
import { computeVelocity, forecast, startingCash } from "@/lib/analytics";
import { compactEur, eur } from "@/lib/types";
import { saveSettings } from "@/lib/app.functions";
import { Btn, Kpi, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Cash forecast — Flow Cockpit" },
      { name: "description", content: "12-week cash forecast weighted by each customer's real payment speed." },
      { property: "og:title", content: "Cash forecast — Flow Cockpit" },
      { property: "og:description", content: "12-week cash forecast weighted by each customer's real payment speed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(snapshotQuery),
  component: Forecast,
});

export function ForecastChart({ weeks, compare }: { weeks: { label: string; inflow: number; outflow: number; balance: number }[]; compare?: { balance: number }[] }) {
  const data = weeks.map((w, k) => ({ ...w, outflowNeg: -w.outflow, scenario: compare?.[k]?.balance }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => compactEur(v)} width={64} />
        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => eur(v)} />
        <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
        <Bar dataKey="inflow" name="Expected in" fill="var(--chart-1)" opacity={0.75} radius={[3, 3, 0, 0]} />
        <Bar dataKey="outflowNeg" name="Out" fill="var(--chart-4)" opacity={0.55} radius={[0, 0, 3, 3]} />
        <Line dataKey="balance" name={compare ? "Baseline balance" : "Balance"} stroke="var(--foreground)" strokeWidth={2} dot={false} />
        {compare && <Line dataKey="scenario" name="Scenario balance" stroke="var(--warning)" strokeWidth={2.5} strokeDasharray="6 3" dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Forecast() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const qc = useQueryClient();
  const [cash, setCash] = useState(String(startingCash(snap)));
  const [fixed, setFixed] = useState(String(snap.settings.monthly_fixed_costs || ""));
  const [weeks, setWeeks] = useState(12);
  const [saving, setSaving] = useState(false);
  const fc = useMemo(() => forecast(snap, weeks), [snap, weeks]);
  const vel = useMemo(() => computeVelocity(snap.invoices), [snap]);
  const totalIn = fc.weeks.reduce((s, w) => s + w.inflow, 0);

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ data: { starting_cash: Number(cash) || 0, monthly_fixed_costs: Number(fixed) || 0 } });
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success("Saved");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader eyebrow="Forecast & payment velocity" title="When the money actually arrives">
        Each open invoice gets an expected pay date from the customer's real lateness, with a confidence range and collection probability. Amounts are converted to EUR at fixed approximate rates.
      </PageHeader>

      {fc.shortfall && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span><b>Shortfall warning:</b> balance turns negative in week {fc.shortfall.week} (from {fc.shortfall.start}), reaching {eur(fc.shortfall.balance)}.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Your inputs">
          <div className="space-y-3 text-sm">
            <label className="block"><span className="text-xs text-muted-foreground">Starting cash (editable assumption)</span>
              <input className={`${inputCls} mt-1 w-full`} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="e.g. 80000" /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Monthly fixed costs (EUR)</span>
              <input className={`${inputCls} mt-1 w-full`} inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="payroll, rent, tools" /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Horizon</span>
              <select className={`${inputCls} mt-1 w-full`} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[4, 8, 12].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select></label>
            <Btn onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save inputs"}</Btn>
            <p className="text-xs text-muted-foreground">Sandbox ledger has no opening balance.</p>
          </div>
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Expected in" value={eur(totalIn)} sub={`${weeks} weeks, probability-weighted`} tone="ok" />
            <Kpi label="End balance" value={eur(fc.weeks.at(-1)?.balance ?? 0)} tone={fc.shortfall ? "danger" : undefined} />
            <Kpi label="Lowest point" value={eur(Math.min(...fc.weeks.map((w) => w.balance)))} />
            <Kpi label="Company avg lateness" value={`${vel.companyAvgLate} d`} sub={`± ${vel.companySd} d`} />
          </div>
          <Panel title="Week by week"><ForecastChart weeks={fc.weeks} /></Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Payment velocity by customer">
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-1.5">Customer</th><th className="py-1.5 text-right">Avg late</th><th className="py-1.5 text-right">± var</th><th className="py-1.5 text-right">Reliability</th><th className="py-1.5 text-right">Open</th></tr>
              </thead>
              <tbody>
                {vel.rows.filter((r) => r.openEur > 0).map((r) => (
                  <tr key={r.customerId} className="border-t border-border">
                    <td className="py-1.5 pr-2"><div className="font-medium">{r.customer}</div><div className="text-[11px] text-muted-foreground">based on {r.basis}</div></td>
                    <td className="py-1.5 text-right font-mono text-xs">{r.avgDaysLate}d</td>
                    <td className="py-1.5 text-right font-mono text-xs">{r.stdev}d</td>
                    <td className="py-1.5 text-right"><Pill tone={r.reliability > 70 ? "ok" : r.reliability > 40 ? "warn" : "danger"}>{r.reliability}</Pill></td>
                    <td className="py-1.5 text-right font-mono text-xs">{eur(r.openEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Expected payment per invoice">
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-1.5">Invoice</th><th className="py-1.5">Expected</th><th className="py-1.5 text-right">Prob.</th><th className="py-1.5 text-right">Remaining</th></tr>
              </thead>
              <tbody>
                {fc.expected.map((e) => (
                  <tr key={e.inv.id} className="border-t border-border">
                    <td className="py-1.5 pr-2"><div className="font-medium">{e.inv.customer}</div><div className="text-[11px] text-muted-foreground">{e.inv.number ?? "—"} · due {e.inv.dueDate}</div></td>
                    <td className="py-1.5 font-mono text-xs">{e.date}<div className="text-[10px] text-muted-foreground">{e.low} – {e.high}</div></td>
                    <td className="py-1.5 text-right font-mono text-xs">{Math.round(e.probability * 100)}%</td>
                    <td className="py-1.5 text-right font-mono text-xs">{eur(e.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
