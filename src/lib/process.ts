// Builds the process-mining model (nodes, edges, variants) from real Light data + local app data.
import type { Inv, Snapshot } from "./types";
import { daysBetween, daysOverdue, isOpen, remainingEur, todayIso } from "./analytics";

export type Risk = "ok" | "warn" | "danger" | "na";
export type PNode = {
  id: string; flow: "o2c" | "p2p" | "e2t"; label: string; x: number; y: number;
  count: number; value: number; avgDays: number | null; risk: Risk; unavailable?: boolean; hint?: string;
  items: { id: string; title: string; sub: string; value: number; days: number | null }[];
};
export type PEdge = { from: string; to: string; count: number; avgDays: number | null; risk: Risk; unavailable?: boolean };
export type Variant = { path: string[]; count: number; value: number };

type Local = {
  orders: { id: string; status: string; quantity: number; unit_price: number; currency: string; customer_name: string; product_name: string; created_at: string; fulfilled_at: string | null }[];
  followUps: { invoice_id: string; created_at: string }[];
  stock: { product_name: string; quantity: number; safety_level: number; unit_cost: number }[];
  expenseChecks: { vendor: string | null; amount: number | null; deductible: boolean | null; match_status: string; created_at: string; expense_date: string | null }[];
  poApprovals: { title: string; status: string; created_at: string }[];
};

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const riskBy = (days: number | null, warn: number, danger: number): Risk => (days == null ? "ok" : days >= danger ? "danger" : days >= warn ? "warn" : "ok");

export function buildProcess(snap: Snapshot, local: Local, fromDate: string | null) {
  const today = todayIso();
  const inv = snap.invoices.filter((i) => !fromDate || (i.invoiceDate ?? i.createdAt.slice(0, 10)) >= fromDate);
  const dunned = new Set(local.followUps.map((f) => f.invoice_id));
  const item = (i: Inv, days: number | null) => ({ id: i.id, title: `${i.customer}`, sub: `${i.number ?? "draft"} · ${i.state.toLowerCase().replace(/_/g, " ")}${i.dueDate ? ` · due ${i.dueDate}` : ""}`, value: i.state === "PAID" ? i.amountEur : remainingEur(i) || i.amountEur, days });

  const drafts = inv.filter((i) => i.state === "DRAFT");
  const open = inv.filter((i) => isOpen(i) && daysOverdue(i, today) === 0 && i.state !== "PARTIALLY_PAID");
  const overdue = inv.filter((i) => isOpen(i) && daysOverdue(i, today) > 0);
  const dunning = inv.filter((i) => dunned.has(i.id) && isOpen(i));
  const partial = inv.filter((i) => i.state === "PARTIALLY_PAID");
  const paid = inv.filter((i) => i.state === "PAID");
  const archived = inv.filter((i) => i.state === "ARCHIVED");
  const paidish = inv.filter((i) => i.lastPaymentDate);
  const ordersOpen = local.orders.filter((o) => o.status === "open");
  const ordersDone = local.orders.filter((o) => o.status === "fulfilled");

  const draftAge = avg(drafts.map((i) => daysBetween(i.createdAt.slice(0, 10), today)));
  const openAge = avg(open.map((i) => daysBetween(i.invoiceDate ?? i.createdAt.slice(0, 10), today)));
  const overdueAge = avg(overdue.map((i) => daysOverdue(i, today)));
  const toCash = avg(paidish.map((i) => daysBetween(i.invoiceDate ?? i.createdAt.slice(0, 10), i.lastPaymentDate!)));
  const draftToOpen = avg(inv.filter((i) => i.openedAt).map((i) => Math.max(0, daysBetween(i.createdAt.slice(0, 10), i.openedAt!.slice(0, 10)))));
  const terms = avg(inv.filter((i) => i.dueDate && i.invoiceDate).map((i) => daysBetween(i.invoiceDate!, i.dueDate!)));

  const lowStock = local.stock.filter((s) => Number(s.quantity) <= Number(s.safety_level));
  const pos = snap.purchaseOrders;
  const allBills = (snap.bills ?? []).filter((b) => !fromDate || (b.issuedDate ?? "") >= fromDate);
  const billsOpen = allBills.filter((b) => !/PAID|ARCHIVED|CANCEL|DECLINED/.test(b.state));
  const billsPaid = allBills.filter((b) => b.state === "PAID");
  const billsLate = billsOpen.filter((b) => b.dueDate && b.dueDate < today);
  const billItem = (b: (typeof allBills)[number]) => ({ id: b.id, title: `${b.vendor}${b.number ? " · " + b.number : ""}`, sub: `${b.state.toLowerCase().replace(/_/g, " ")}${b.dueDate ? " · due " + b.dueDate : ""}`, value: b.amountEur, days: b.issuedDate ? daysBetween(b.issuedDate, today) : null });
  const exChecks = local.expenseChecks.filter((e) => !fromDate || (e.expense_date ?? e.created_at.slice(0, 10)) >= fromDate);
  const lightExp = snap.expenses.filter((e) => !fromDate || (e.date ?? "") >= fromDate);
  const deductible = exChecks.filter((e) => e.deductible);

  const Y1 = 70, Y2 = 300, Y3 = 430;
  const nodes: PNode[] = [
    { id: "order", flow: "o2c", label: "Order", x: 70, y: Y1, count: ordersOpen.length, value: sum(ordersOpen.map((o) => o.quantity * o.unit_price)), avgDays: avg(ordersOpen.map((o) => daysBetween(o.created_at.slice(0, 10), today))), risk: "ok", hint: "Orders captured in the cockpit (Light has no orders)", items: ordersOpen.map((o) => ({ id: o.id, title: o.customer_name, sub: `${o.quantity} × ${o.product_name}`, value: o.quantity * o.unit_price, days: null })) },
    { id: "fulfil", flow: "o2c", label: "Fulfilment", x: 230, y: Y1, count: ordersDone.length, value: sum(ordersDone.map((o) => o.quantity * o.unit_price)), avgDays: avg(ordersDone.filter((o) => o.fulfilled_at).map((o) => daysBetween(o.created_at.slice(0, 10), o.fulfilled_at!.slice(0, 10)))), risk: "ok", items: ordersDone.map((o) => ({ id: o.id, title: o.customer_name, sub: `${o.quantity} × ${o.product_name}`, value: o.quantity * o.unit_price, days: null })) },
    { id: "draft", flow: "o2c", label: "Draft invoice", x: 390, y: Y1, count: drafts.length, value: sum(drafts.map((i) => i.amountEur)), avgDays: draftAge, risk: riskBy(draftAge, 7, 21), items: drafts.map((i) => item(i, daysBetween(i.createdAt.slice(0, 10), today))) },
    { id: "open", flow: "o2c", label: "Open", x: 550, y: Y1, count: open.length, value: sum(open.map(remainingEur)), avgDays: openAge, risk: riskBy(openAge, 25, 45), items: open.map((i) => item(i, daysBetween(i.invoiceDate ?? today, today))) },
    { id: "overdue", flow: "o2c", label: "Overdue", x: 710, y: Y1 + 110, count: overdue.length, value: sum(overdue.map(remainingEur)), avgDays: overdueAge, risk: overdue.length ? riskBy(overdueAge, 1, 30) : "ok", items: overdue.map((i) => item(i, daysOverdue(i, today))).sort((a, b) => (b.days ?? 0) - (a.days ?? 0)) },
    { id: "dunning", flow: "o2c", label: "Reminder / dunning", x: 870, y: Y1 + 110, count: dunning.length, value: sum(dunning.map(remainingEur)), avgDays: null, risk: dunning.length ? "warn" : "ok", hint: "Invoices with logged follow-ups", items: dunning.map((i) => item(i, daysOverdue(i, today))) },
    { id: "partial", flow: "o2c", label: "Partially paid", x: 870, y: Y1 - 20, count: partial.length, value: sum(partial.map(remainingEur)), avgDays: null, risk: partial.length ? "warn" : "ok", items: partial.map((i) => item(i, null)) },
    { id: "paid", flow: "o2c", label: "Payment", x: 1030, y: Y1, count: paid.length, value: sum(paid.map((i) => i.amountEur)), avgDays: toCash, risk: "ok", items: paid.map((i) => item(i, i.invoiceDate && i.lastPaymentDate ? daysBetween(i.invoiceDate, i.lastPaymentDate) : null)) },
    { id: "cash", flow: "o2c", label: "Cash", x: 1180, y: Y1, count: paidish.length, value: sum(paidish.map((i) => i.paidAmount * (i.amountEur / (i.amount || 1)))), avgDays: null, risk: "ok", hint: "Collected via Light payments", items: paidish.map((i) => item(i, null)) },
    { id: "archived", flow: "o2c", label: "Archived", x: 550, y: Y1 + 140, count: archived.length, value: sum(archived.map((i) => i.amountEur)), avgDays: null, risk: "na", items: archived.map((i) => item(i, null)) },

    { id: "lowstock", flow: "p2p", label: "Low stock", x: 70, y: Y2, count: lowStock.length, value: sum(lowStock.map((s) => s.unit_cost * Math.max(0, s.safety_level - s.quantity))), avgDays: null, risk: lowStock.length ? "danger" : "ok", hint: "Stock levels tracked in the cockpit", items: lowStock.map((s) => ({ id: s.product_name, title: s.product_name, sub: `${s.quantity} left · safety ${s.safety_level}`, value: 0, days: null })) },
    { id: "po", flow: "p2p", label: "Purchase order", x: 390, y: Y2, count: pos.length + local.poApprovals.filter((a) => a.status === "pending").length, value: sum(pos.map((p) => p.total)), avgDays: avg(pos.filter((p) => p.date).map((p) => daysBetween(p.date!, today))), risk: "ok", items: [...pos.map((p) => ({ id: p.id, title: `PO ${p.id.slice(0, 8)}`, sub: p.state.toLowerCase().replace(/_/g, " "), value: p.total, days: p.date ? daysBetween(p.date, today) : null })), ...local.poApprovals.filter((a) => a.status === "pending").map((a) => ({ id: a.created_at, title: a.title, sub: "awaiting approval", value: 0, days: null }))] },
    { id: "bill", flow: "p2p", label: "Vendor bill", x: 710, y: Y2, count: billsOpen.length, value: sum(billsOpen.map((b) => b.amountEur)), avgDays: avg(billsOpen.filter((b) => b.issuedDate).map((b) => daysBetween(b.issuedDate!, today))), risk: billsLate.length ? "danger" : billsOpen.length ? "warn" : "ok", hint: "Unpaid vendor bills in Light", items: billsOpen.map(billItem) },
    { id: "billpay", flow: "p2p", label: "Bill payment", x: 1030, y: Y2, count: billsPaid.length, value: sum(billsPaid.map((b) => b.amountEur)), avgDays: null, risk: "ok", hint: "Paid vendor bills", items: billsPaid.map(billItem) },

    { id: "evidence", flow: "e2t", label: "Email / receipt", x: 70, y: Y3, count: exChecks.length, value: sum(exChecks.map((e) => e.amount ?? 0)), avgDays: null, risk: exChecks.some((e) => e.match_status === "missing_in_light") ? "warn" : "ok", hint: "Receipts checked in the cockpit", items: exChecks.map((e, k) => ({ id: String(k), title: e.vendor ?? "Receipt", sub: e.match_status.replace(/_/g, " "), value: e.amount ?? 0, days: null })) },
    { id: "expense", flow: "e2t", label: "Expense in Light", x: 390, y: Y3, count: lightExp.length, value: sum(lightExp.map((e) => e.amountEur)), avgDays: null, risk: lightExp.some((e) => e.status === "IN_DRAFT") ? "warn" : "ok", items: lightExp.map((e) => ({ id: e.id, title: e.description || "Expense", sub: `${e.status.toLowerCase().replace(/_/g, " ")} · ${e.date ?? ""}`, value: e.amountEur, days: null })) },
    { id: "deduct", flow: "e2t", label: "Deduction", x: 710, y: Y3, count: deductible.length, value: sum(deductible.map((e) => e.amount ?? 0)), avgDays: null, risk: "ok", items: deductible.map((e, k) => ({ id: String(k), title: e.vendor ?? "Receipt", sub: "likely deductible", value: e.amount ?? 0, days: null })) },
    { id: "filing", flow: "e2t", label: "Quarterly filing", x: 1030, y: Y3, count: 0, value: sum(deductible.map((e) => e.amount ?? 0)), avgDays: null, risk: "ok", hint: "Deductible total for the current quarter", items: [] },
  ];

  const paidLate = paidish.filter((i) => i.dueDate && i.lastPaymentDate! > i.dueDate);
  const edges: PEdge[] = [
    { from: "order", to: "fulfil", count: ordersDone.length, avgDays: null, risk: "ok" },
    { from: "fulfil", to: "draft", count: ordersDone.length, avgDays: 0, risk: "ok" },
    { from: "draft", to: "open", count: inv.filter((i) => i.openedAt).length, avgDays: draftToOpen, risk: riskBy(draftToOpen, 5, 14) },
    { from: "open", to: "overdue", count: overdue.length + paidLate.length, avgDays: terms, risk: overdue.length > open.length ? "danger" : "warn" },
    { from: "overdue", to: "dunning", count: inv.filter((i) => dunned.has(i.id)).length, avgDays: null, risk: "warn" },
    { from: "open", to: "partial", count: partial.length, avgDays: null, risk: "ok" },
    { from: "open", to: "paid", count: paidish.length - paidLate.length, avgDays: toCash, risk: "ok" },
    { from: "overdue", to: "paid", count: paidLate.length, avgDays: avg(paidLate.map((i) => daysBetween(i.dueDate!, i.lastPaymentDate!))), risk: "warn" },
    { from: "dunning", to: "paid", count: paid.filter((i) => dunned.has(i.id)).length, avgDays: null, risk: "ok" },
    { from: "partial", to: "paid", count: 0, avgDays: null, risk: "ok" },
    { from: "paid", to: "cash", count: paidish.length, avgDays: 0, risk: "ok" },
    { from: "open", to: "archived", count: archived.length, avgDays: null, risk: "na" },
    { from: "lowstock", to: "po", count: local.poApprovals.length, avgDays: null, risk: "ok" },
    { from: "po", to: "bill", count: allBills.length, avgDays: null, risk: billsLate.length ? "danger" : "ok" },
    { from: "bill", to: "billpay", count: billsPaid.length, avgDays: null, risk: "ok" },
    { from: "evidence", to: "expense", count: exChecks.filter((e) => e.match_status === "matched").length, avgDays: null, risk: "ok" },
    { from: "expense", to: "deduct", count: deductible.length, avgDays: null, risk: "ok" },
    { from: "deduct", to: "filing", count: deductible.length, avgDays: null, risk: "ok" },
  ];

  // Variants (most common paths for invoices)
  const vmap = new Map<string, Variant>();
  inv.forEach((i) => {
    const p = ["Draft"];
    if (i.state === "ARCHIVED") p.push("Archived");
    else if (i.state !== "DRAFT") {
      p.push("Open");
      const late = (i.lastPaymentDate && i.dueDate && i.lastPaymentDate > i.dueDate) || daysOverdue(i, today) > 0;
      if (late) p.push("Overdue");
      if (dunned.has(i.id)) p.push("Dunning");
      if (i.state === "PARTIALLY_PAID") p.push("Partially paid");
      if (i.state === "PAID") p.push("Paid");
    }
    const k = p.join(">");
    const v = vmap.get(k) ?? { path: p, count: 0, value: 0 };
    v.count++; v.value += i.amountEur; vmap.set(k, v);
  });
  const variants = [...vmap.values()].sort((a, b) => b.count - a.count);
  // Show only steps that have real data, and only the flows between them.
  const live = nodes.filter((n) => n.count > 0 && Math.round(n.value) > 0 && !n.unavailable);
  const ids = new Set(live.map((n) => n.id));
  const liveEdges = edges.filter((e) => e.count > 0 && !e.unavailable && ids.has(e.from) && ids.has(e.to));
  return { nodes: live, edges: liveEdges, variants, total: inv.length };
}
