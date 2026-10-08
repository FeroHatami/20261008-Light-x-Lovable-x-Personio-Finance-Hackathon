import { createServerFn } from "@tanstack/react-start";

export type HealthRow = { label: string; path: string; ok: boolean; count: number | null; note: string };

const CHECKS: { label: string; path: string; note: string }[] = [
  { label: "Sales invoices (all states)", path: "invoice-receivables", note: "Needed for flows, payment speed and forecast." },
  { label: "Customers", path: "customers", note: "Names for invoices; payment behaviour per customer." },
  { label: "Vendor bills", path: "bff/invoice-payables", note: "Procure-to-Pay and outgoing cash." },
  { label: "Vendors", path: "vendors", note: "Suppliers for bills and purchase orders." },
  { label: "Products", path: "products", note: "Catalog for inventory module." },
  { label: "Purchase orders", path: "purchase-orders", note: "Procure-to-Pay flow." },
  { label: "Expenses", path: "expenses", note: "Expense-to-Tax flow." },
  { label: "Bank accounts", path: "bank-accounts", note: "Balances come from each account’s balance read (ledger balance in the sandbox)." },
  { label: "Ledger accounts", path: "ledger-accounts", note: "Chart of accounts." },
  { label: "Journal entries", path: "journal-entries", note: "Possible source for cash movements." },
];

export const getDataHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { lightGet } = await import("./light.server");
  const rows = await Promise.all(
    CHECKS.map(async (c): Promise<HealthRow> => {
      try {
        const { status, body } = await lightGet(c.path, { limit: "1" });
        if (status !== 200) {
          return { ...c, ok: false, count: null, note: `Not available through the API (HTTP ${status}). ${c.note}` };
        }
        const count = Array.isArray(body) ? body.length : (body?.total ?? body?.records?.length ?? null);
        return { ...c, ok: true, count };
      } catch {
        return { ...c, ok: false, count: null, note: `Request failed. ${c.note}` };
      }
    }),
  );
  return { checkedAt: new Date().toISOString(), rows };
});
