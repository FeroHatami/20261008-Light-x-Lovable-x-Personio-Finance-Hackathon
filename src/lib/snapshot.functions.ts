/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import type { Snapshot, Inv } from "./types";
import { toEur } from "./types";

export const getSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<Snapshot> => {
  const { requireUser } = await import("./db.server");
  const { db } = await requireUser();
  const { lightList, lightGet } = await import("./light.server");

  const [rawInv, rawCust, rawVend, rawProd, rawPo, rawExp, rawBills, bankRes, settingsRes] = await Promise.all([
    lightList("invoice-receivables", { sort: "createdAt:desc" }),
    lightList("customers"),
    lightList("vendors"),
    lightList("products"),
    lightList("purchase-orders"),
    lightList("expenses"),
    // Light's bill list errors on offset paging, so read newest and oldest pages and merge.
    Promise.all(["createdAt:desc", "createdAt:asc"].map((sort) => lightGet("bff/invoice-payables", { limit: "50", sort })))
      .then((rs) => { const m = new Map<string, any>(); rs.forEach((r) => ((r.body as any)?.records ?? []).forEach((b: any) => m.set(b.id, b))); return [...m.values()]; })
      .catch(() => []),
    lightGet("bank-accounts"),
    db.from("settings").select("starting_cash, monthly_fixed_costs").maybeSingle(),
  ]);

  const names = new Map(rawCust.map((c: any) => [c.id, String(c.name ?? "")]));
  const paidLike = rawInv.filter((r: any) => r.state === "PAID" || r.state === "PARTIALLY_PAID");
  const payments = new Map<string, any[]>();
  await Promise.all(
    paidLike.map(async (r: any) => {
      const { status, body } = await lightGet(`invoice-receivables/${r.id}/payments`);
      if (status === 200 && Array.isArray(body)) payments.set(r.id, body);
    }),
  );

  const accounts: any[] = Array.isArray(bankRes.body) ? bankRes.body : (bankRes.body as any)?.records ?? [];
  const balances = await Promise.all(accounts.map(async (acc: any) => {
    const { status, body } = await lightGet(`bank-accounts/${acc.id}/balance`);
    if (status !== 200) return null;
    const b: any = body; const raw = b.bankBalance ?? b.ledgerBalance;
    if (raw == null) return null;
    const amount = Number(raw) / 100; const currency = String(b.currency ?? acc.currency ?? "EUR");
    return { id: acc.id, name: String(acc.name ?? acc.accountName ?? currency + " account"), currency, amount, amountEur: toEur(amount, currency), source: b.bankBalance != null ? "bank" : "ledger" };
  }));

  const invoices: Inv[] = rawInv.map((r: any) => {
    const pays = payments.get(r.id) ?? [];
    const amount = Number(r.amount ?? 0) / 100;
    const currency = String(r.currency ?? "EUR");
    const last = pays.map((p) => String(p.paymentDate)).sort().at(-1) ?? null;
    return {
      id: r.id,
      number: r.invoiceNumber ?? null,
      customerId: r.customerId,
      customer: names.get(r.customerId) || "Unknown customer",
      description: String(r.description ?? ""),
      amount,
      amountEur: toEur(amount, currency),
      currency,
      state: String(r.state),
      invoiceDate: r.invoiceDate ?? r.effectiveInvoiceDate ?? null,
      dueDate: r.dueDate ?? null,
      createdAt: String(r.createdAt),
      openedAt: r.openedAt ?? null,
      paidAmount: pays.reduce((s, p) => s + Number(p.amount ?? 0) / 100, 0),
      lastPaymentDate: last,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    invoices,
    customers: rawCust.map((c: any) => ({ id: c.id, name: String(c.name ?? ""), email: c.email ?? null })),
    vendors: rawVend.map((v: any) => ({ id: v.vendorId ?? v.id, name: String(v.name ?? v.legalName ?? v.displayName ?? "Vendor") })),
    products: rawProd.map((p: any) => ({
      id: p.id,
      name: String(p.name),
      price: Number(p.pricings?.[0]?.amount ?? 0) / 100,
      currency: String(p.pricings?.[0]?.currency ?? "EUR"),
    })),
    purchaseOrders: rawPo.map((p: any) => ({
      id: p.id, state: String(p.state), total: Number(p.totalAmount ?? 0) / 100, date: p.purchaseOrderDate ?? null, vendorId: p.vendorId ?? null,
    })),
    expenses: rawExp.map((e: any) => {
      const amount = (e.lineItems ?? []).reduce((s: number, l: any) => s + Number(l.billingAmount ?? 0), 0) / 100;
      const currency = String(e.billingCurrency ?? "EUR");
      return {
        id: e.id, status: String(e.status), date: e.performedDate ?? null, amount, currency, amountEur: toEur(amount, currency),
        description: (e.lineItems ?? []).map((l: any) => l.description).filter(Boolean).join("; "),
      };
    }),
    settings: {
      starting_cash: Number(settingsRes.data?.starting_cash ?? 0),
      monthly_fixed_costs: Number(settingsRes.data?.monthly_fixed_costs ?? 0),
    },
    bills: rawBills.map((b: any) => {
      const amount = Number(b.amount ?? 0) / 100; const currency = String(b.currency ?? "EUR");
      return { id: b.id, number: b.invoiceNumber ?? null, vendor: String(b.vendor?.name ?? b.vendorName ?? "Vendor"), state: String(b.state), amount, currency, amountEur: toEur(amount, currency), issuedDate: b.issuedDate ?? null, dueDate: b.dueDate ?? null };
    }),
    bankBalances: balances.filter(Boolean) as any,
    unavailable: ["Invoice payment history is sparse in the sandbox (few paid invoices), so payment-speed estimates fall back to due dates"],
  };
});
