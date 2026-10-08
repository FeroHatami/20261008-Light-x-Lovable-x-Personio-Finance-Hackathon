import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Sparkles, TrendingDown, Info } from "lucide-react";
import { snapshotQuery, rowsQuery } from "@/lib/queries";
import { buildProcess } from "@/lib/process";
import { addDays, avgDaysToPay, computeVelocity, forecast, startingCash, nextTaxDeadline, remainingEur, daysOverdue, todayIso, isOpen } from "@/lib/analytics";
import { compactEur, eur } from "@/lib/types";
import { ProcessMap, RiskLegend, type Prediction } from "@/components/ProcessMap";
import { Kpi, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Process overview — Flow Cockpit" },
      { name: "description", content: "Process map of how invoices, orders and expenses flow through your business in Light." },
      { property: "og:title", content: "Process overview — Flow Cockpit" },
      { property: "og:description", content: "Process map of how invoices, orders and expenses flow through your business in Light." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([
    q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("follow_ups")), q.prefetchQuery(rowsQuery("orders")),
    q.prefetchQuery(rowsQuery("stock")), q.prefetchQuery(rowsQuery("expense_checks")), q.prefetchQuery(rowsQuery("approvals")),
  ]),
  component: Overview,
});

const RANGES = [
  { id: "week", label: "This week", days: 7 }, { id: "quarter", label: "Quarter", days: 91 },
  { id: "year", label: "Year", days: 365 }, { id: "all", label: "All time", days: null }, { id: "custom", label: "Custom", days: null },
] as const;

function Overview() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: followUps } = useSuspenseQuery(rowsQuery("follow_ups"));
  const { data: orders } = useSuspenseQuery(rowsQuery("orders"));
  const { data: stock } = useSuspenseQuery(rowsQuery("stock"));
  const { data: checks } = useSuspenseQuery(rowsQuery("expense_checks"));
  const { data: approvals } = useSuspenseQuery(rowsQuery("approvals"));
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const [custom, setCustom] = useState(addDays(todayIso(), -180));
  const [selected, setSelected] = useState<string | null>("overdue");
  const [showPred, setShowPred] = useState(true);
  const today = todayIso();

  const fromDate = range === "all" ? null : range === "custom" ? custom : addDays(today, -(RANGES.find((r) => r.id === range)!.days ?? 0));
  const model = useMemo(() => buildProcess(snap, {
    orders, followUps, stock, expenseChecks: checks,
    poApprovals: approvals.filter((a) => a.kind === "draft_po"),
  }, fromDate), [snap, orders, followUps, stock, checks, approvals, fromDate]);

  const fc = useMemo(() => forecast(snap), [snap]);
  const vel = useMemo(() => computeVelocity(snap.invoices), [snap]);
  const overdueEur = snap.invoices.filter((i) => daysOverdue(i) > 0).reduce((s, i) => s + remainingEur(i), 0);
  const adtp = avgDaysToPay(snap.invoices);
  const tax = nextTaxDeadline();

  const predictions: Prediction[] = useMemo(() => {
    const soonest = (ids: Set<string>) => fc.expected.filter((e) => ids.has(e.inv.id));
    const mk = (nodeId: string, ids: Set<string>): Prediction[] => {
      const list = soonest(ids); if (!list.length) return [];
      const medianDays = Math.round(list.map((e) => (Date.parse(e.date) - Date.parse(today)) / 86400000).sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0);
      return [{ nodeId, label: `→ paid in ~${medianDays}d (median)` }];
    };
    const n = new Map(model.nodes.map((x) => [x.id, new Set(x.items.map((i) => i.id))]));
    return [...mk("open", n.get("open")!), ...mk("overdue", n.get("overdue")!), ...mk("partial", n.get("partial")!)];
  }, [fc, model, today]);

  const node = model.nodes.find((n) => n.id === selected) ?? null;
  const drafts = snap.invoices.filter((i) => i.state === "DRAFT");
  const topLate = vel.rows.filter((r) => r.overdueEur > 0).sort((a, b) => b.overdueEur - a.overdueEur)[0];
  const pending = approvals.filter((a) => a.status === "pending").length;

  const alerts: { tone: "danger" | "warn" | "info"; text: string; to?: string }[] = [];
  if (fc.shortfall) alerts.push({ tone: "danger", text: `You'll be short in week ${fc.shortfall.week} (from ${fc.shortfall.start}): balance ${eur(fc.shortfall.balance)}.`, to: "/forecast" });
  if (topLate) alerts.push({ tone: "danger", text: `${topLate.customer} owes ${eur(topLate.overdueEur)} overdue, up to ${topLate.maxOverdue} days late.`, to: "/collections" });
  const oldDrafts = drafts.filter((i) => (Date.parse(today) - Date.parse(i.createdAt)) / 86400000 > 14);
  if (oldDrafts.length) alerts.push({ tone: "warn", text: `${oldDrafts.length} draft invoices older than 14 days haven't been sent.`, });
  if (pending) alerts.push({ tone: "info", text: `${pending} item${pending > 1 ? "s" : ""} waiting in the approval queue (top right).` });
  const lateBills = (snap.bills ?? []).filter((b) => !/PAID|ARCHIVED|CANCEL|DECLINED/.test(b.state) && b.dueDate && b.dueDate < today);
  if (lateBills.length) alerts.push({ tone: "warn", text: `${lateBills.length} vendor bill${lateBills.length > 1 ? "s are" : " is"} past due (${eur(lateBills.reduce((a, b) => a + b.amountEur, 0))}).` });

  const outlook = fc.weeks.at(-1)?.balance ?? 0;
  const topPreds = fc.expected.filter((e) => isOpen(e.inv)).sort((a, b) => b.remaining - a.remaining).slice(0, 6);

  return (
    <div>
      <PageHeader eyebrow="Process intelligence · live from Light" title="How money flows through the business"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {RANGES.map((r) => (
                <button key={r.id} onClick={() => setRange(r.id)} className={cn("rounded px-2.5 py-1 text-xs", range === r.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{r.label}</button>
              ))}
            </div>
            {range === "custom" && <input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} className={inputCls} aria-label="From date" />}
          </div>
        }>
        {model.total} invoices in range · updated {new Date(snap.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Click any step to drill into the items behind it.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Starting cash" value={eur(startingCash(snap))} sub={<Link to="/forecast" className="underline-offset-2 hover:underline">editable assumption →</Link>} />
        <Kpi label="12-week outlook" value={eur(outlook)} sub={fc.shortfall ? `dips below 0 in W${fc.shortfall.week}` : "no shortfall predicted"} tone={fc.shortfall ? "danger" : "ok"} />
        <Kpi label="Overdue" value={eur(overdueEur)} sub={`${snap.invoices.filter((i) => daysOverdue(i) > 0).length} invoices`} tone="danger" />
        {adtp != null && <Kpi label="Avg days to pay" value={`${adtp} d`} sub={`customers avg ${vel.companyAvgLate}d late`} />}
        <Kpi label="Next tax deadline" value={tax} sub={`in ${Math.round((Date.parse(tax) - Date.parse(today)) / 86400000)} days · quarterly VAT`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <Panel title="Process map" right={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showPred} onChange={(e) => setShowPred(e.target.checked)} className="accent-[var(--primary)]" />
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Predicted route
          </label>
        }>
          <ProcessMap nodes={model.nodes} edges={model.edges} selected={selected} onSelect={(id) => setSelected((s) => (s === id ? null : id))} predictions={predictions} showPredictions={showPred} />
          <RiskLegend className="mt-2" />
        </Panel>

        <Panel title="Alerts">
          <ul className="space-y-2.5">
            {alerts.map((a, k) => {
              const Icon = a.tone === "danger" ? TrendingDown : a.tone === "warn" ? AlertTriangle : Info;
              const body = (
                <div className={cn("flex gap-2.5 rounded-md border p-2.5 text-xs leading-relaxed",
                  a.tone === "danger" && "border-destructive/30 bg-destructive/5", a.tone === "warn" && "border-warning/30 bg-warning/5", a.tone === "info" && "border-border")}>
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", a.tone === "danger" && "text-destructive", a.tone === "warn" && "text-warning", a.tone === "info" && "text-muted-foreground")} />
                  <span>{a.text}</span>
                </div>
              );
              return <li key={k}>{a.to ? <Link to={a.to} className="block hover:opacity-90">{body}</Link> : body}</li>;
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel title={node ? `${node.label} · ${node.count} items · ${compactEur(node.value)}` : "Drill-down"} className="xl:col-span-2">
          {!node ? <p className="text-sm text-muted-foreground">Select a step in the map.</p> : node.unavailable ? (
            <p className="text-sm text-muted-foreground">{node.hint}. This step stays empty until Light exposes the data.</p>
          ) : node.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in this step for the selected period.{node.hint ? ` ${node.hint}.` : ""}</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-1.5 font-medium">Item</th><th className="py-1.5 font-medium">Detail</th><th className="py-1.5 text-right font-medium">Days</th><th className="py-1.5 text-right font-medium">Value</th></tr>
                </thead>
                <tbody>
                  {node.items.slice(0, 100).map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-medium">{it.title}</td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">{it.sub}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{it.days ?? "—"}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{eur(it.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Process variants">
          <ul className="space-y-2">
            {model.variants.slice(0, 6).map((v, k) => {
              const pct = Math.round((v.count / Math.max(1, model.total)) * 100);
              return (
                <li key={k}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate">{v.path.join(" → ")}</span>
                    <span className="ml-2 shrink-0 font-mono text-muted-foreground">{v.count} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Predicted route · largest open items" className="mt-4" right={<Pill tone="info">velocity-weighted</Pill>}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {topPreds.map((e) => (
            <div key={e.inv.id} className="flex items-center gap-3 rounded-md border border-border p-2.5">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.inv.customer} <span className="text-muted-foreground">{e.inv.number ?? ""}</span></p>
                <p className="text-xs text-muted-foreground">likely paid {e.date} <span className="font-mono">({e.low} – {e.high})</span> · {Math.round(e.probability * 100)}%</p>
              </div>
              <span className="font-mono text-sm">{compactEur(e.remaining)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
