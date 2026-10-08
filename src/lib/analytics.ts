// Pure, client-safe analytics: payment velocity, expected payments, cash forecast, scenarios.
import type { Inv, Snapshot } from "./types";

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const dayMs = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * dayMs).toISOString().slice(0, 10);

export const OPEN_STATES = new Set(["OPEN", "PARTIALLY_PAID", "CREATED", "OPEN_IN_PROGRESS", "PAYMENT_PENDING"]);
export const isOpen = (i: Inv) => OPEN_STATES.has(i.state);
export const remainingEur = (i: Inv) => (i.amount > 0 ? i.amountEur * Math.max(0, 1 - i.paidAmount / i.amount) : 0);
export const daysOverdue = (i: Inv, today = todayIso()) => (i.dueDate && isOpen(i) ? Math.max(0, daysBetween(i.dueDate, today)) : 0);
export const isOverdue = (i: Inv) => daysOverdue(i) > 0;

export type Velocity = {
  customerId: string; customer: string;
  paidCount: number; samples: number;
  avgDaysLate: number; stdev: number; reliability: number;
  openEur: number; overdueEur: number; overdueCount: number; maxOverdue: number;
  basis: "history" | "open items" | "company average";
};

function stats(xs: number[]) {
  if (!xs.length) return { mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, sd };
}

export function computeVelocity(invoices: Inv[]) {
  const today = todayIso();
  const by = new Map<string, Inv[]>();
  invoices.forEach((i) => by.set(i.customerId, [...(by.get(i.customerId) ?? []), i]));
  const allSamples: number[] = [];
  const rows: Velocity[] = [];
  for (const [customerId, list] of by) {
    const paid = list.filter((i) => i.lastPaymentDate && i.dueDate).map((i) => daysBetween(i.dueDate!, i.lastPaymentDate!));
    const openLate = list.filter((i) => isOpen(i) && daysOverdue(i, today) > 0).map((i) => daysOverdue(i, today));
    const samples = [...paid, ...openLate];
    allSamples.push(...samples);
    const { mean, sd } = stats(samples);
    const open = list.filter(isOpen);
    rows.push({
      customerId, customer: list[0]?.customer ?? "Unknown",
      paidCount: paid.length, samples: samples.length,
      avgDaysLate: Math.round(mean), stdev: Math.round(sd),
      reliability: 0,
      openEur: open.reduce((s, i) => s + remainingEur(i), 0),
      overdueEur: open.filter((i) => daysOverdue(i, today) > 0).reduce((s, i) => s + remainingEur(i), 0),
      overdueCount: openLate.length,
      maxOverdue: Math.max(0, ...openLate),
      basis: paid.length ? "history" : samples.length ? "open items" : "company average",
    });
  }
  const company = stats(allSamples);
  rows.forEach((r) => {
    if (r.basis === "company average") { r.avgDaysLate = Math.round(company.mean); r.stdev = Math.round(company.sd); }
    r.reliability = Math.max(5, Math.min(100, Math.round(100 - Math.max(0, r.avgDaysLate) * 0.6 - r.stdev * 0.3)));
  });
  rows.sort((a, b) => b.openEur - a.openEur);
  return { rows, companyAvgLate: Math.round(company.mean), companySd: Math.round(company.sd) };
}

export type Expected = { inv: Inv; date: string; low: string; high: string; probability: number; remaining: number; delay: number };

export function expectedPayments(invoices: Inv[], extraDelay: (i: Inv) => number = () => 0): Expected[] {
  const today = todayIso();
  const { rows, companyAvgLate, companySd } = computeVelocity(invoices);
  const vel = new Map(rows.map((r) => [r.customerId, r]));
  return invoices.filter(isOpen).map((inv) => {
    const v = vel.get(inv.customerId);
    const delay = Math.max(0, v?.avgDaysLate ?? companyAvgLate);
    const sd = Math.max(5, v?.stdev ?? companySd);
    const due = inv.dueDate ?? addDays(inv.invoiceDate ?? today, 30);
    let date = addDays(due, delay);
    const od = daysOverdue(inv, today);
    if (date <= today) date = addDays(today, Math.min(45, 7 + Math.round(od / 4)));
    date = addDays(date, extraDelay(inv));
    const probability = od > 180 ? 0.3 : od > 90 ? 0.55 : od > 30 ? 0.8 : 0.95;
    return {
      inv, date, low: addDays(date, -Math.round(sd)), high: addDays(date, Math.round(sd)),
      probability: Math.round(probability * (0.6 + 0.4 * ((v?.reliability ?? 60) / 100)) * 100) / 100,
      remaining: remainingEur(inv), delay,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export type ScenarioParams = {
  delayDays: number;          // delay all collections
  revenueDropPct: number;     // drop on expected inflows
  oneOffAmount: number; oneOffWeek: number;
  topLateCount: number; topLateDays: number;
  hires: number; hireMonthlyCost: number; hireStartWeek: number;
};
export const BASELINE: ScenarioParams = { delayDays: 0, revenueDropPct: 0, oneOffAmount: 0, oneOffWeek: 2, topLateCount: 0, topLateDays: 30, hires: 0, hireMonthlyCost: 6000, hireStartWeek: 4 };

export type Week = { week: number; start: string; label: string; inflow: number; outflow: number; balance: number };

/** Default opening cash assumption: the sandbox ledger has no opening balance, so its balances are not usable. */
export const DEFAULT_STARTING_CASH = 150000;
export function startingCash(snap: { settings: { starting_cash: number } }) {
  return snap.settings.starting_cash || DEFAULT_STARTING_CASH;
}

export function forecast(snap: Pick<Snapshot, "invoices" | "settings"> & { bankBalances?: Snapshot["bankBalances"] }, weeks = 12, p: ScenarioParams = BASELINE) {
  const today = todayIso();
  const { rows } = computeVelocity(snap.invoices);
  const top = new Set(rows.slice(0, p.topLateCount).map((r) => r.customerId));
  const exp = expectedPayments(snap.invoices, (i) => p.delayDays + (top.has(i.customerId) ? p.topLateDays : 0));
  const weeklyFixed = (snap.settings.monthly_fixed_costs || 0) / 4.33;
  let balance = startingCash(snap);
  const out: Week[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(today, w * 7), end = addDays(today, (w + 1) * 7);
    const inflow = exp.filter((e) => e.date >= start && e.date < end).reduce((s, e) => s + e.remaining * e.probability, 0) * (1 - p.revenueDropPct / 100);
    const hireCost = w >= p.hireStartWeek ? (p.hires * p.hireMonthlyCost) / 4.33 : 0;
    const outflow = weeklyFixed + hireCost + (w === p.oneOffWeek ? p.oneOffAmount : 0);
    balance += inflow - outflow;
    out.push({ week: w + 1, start, label: `W${w + 1}`, inflow: Math.round(inflow), outflow: Math.round(outflow), balance: Math.round(balance) });
  }
  const shortfall = out.find((x) => x.balance < 0) ?? null;
  return { weeks: out, shortfall, expected: exp };
}

export function avgDaysToPay(invoices: Inv[]) {
  const xs = invoices.filter((i) => i.lastPaymentDate && i.invoiceDate).map((i) => daysBetween(i.invoiceDate!, i.lastPaymentDate!));
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function nextTaxDeadline(today = todayIso()) {
  // Quarterly VAT: 10th of the month after quarter end (typical EU/DK cadence; confirm with your accountant).
  const d = new Date(today);
  const q = Math.floor(d.getUTCMonth() / 3);
  const candidate = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 10));
  return candidate.toISOString().slice(0, 10);
}
