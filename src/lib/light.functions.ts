/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://api.sandbox.light.inc/rest/ext/v1";
const FILTER = "state:in:DRAFT|OPEN|PARTIALLY_PAID|CREATED|OPEN_IN_PROGRESS|PAYMENT_PENDING";

export type Invoice = {
  id: string;
  number: string | null;
  customer: string;
  amount: number;
  currency: string;
  state: string;
  invoiceDate: string | null;
  dueDate: string | null;
  createdAt: string;
};

type Raw = { id: string; name?: any; invoiceNumber?: any; number?: any; customerId?: any; amount?: any; currency?: any; state?: any; invoiceDate?: any; effectiveInvoiceDate?: any; dueDate?: any; createdAt?: any };

async function fetchAll(path: string, key: string, params: Record<string, string> = {}) {
  const out: Raw[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const qs = new URLSearchParams({ ...params, limit: "100", offset: String(offset) });
    const res = await fetch(`${BASE}/${path}?${qs}`, {
      headers: { Authorization: `Basic ${key}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error("Light API error", path, res.status, await res.text());
      throw new Error("Could not load data from Light");
    }
    const json = (await res.json()) as { records: Raw[]; hasMore: boolean };
    out.push(...json.records);
    if (!json.hasMore) break;
  }
  return out;
}

export const getInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["LIGHT_API_KEY"];
  if (!key) throw new Error("LIGHT_API_KEY missing");
  const [invoices, customers] = await Promise.all([
    fetchAll("invoice-receivables", key, { filter: FILTER, sort: "createdAt:desc" }),
    fetchAll("customers", key),
  ]);
  const names = new Map(customers.map((c) => [c.id, String(c.name ?? "")]));
  return invoices.map<Invoice>((r) => ({
    id: r.id,
    number: (r.invoiceNumber as string) ?? (r.number as string) ?? null,
    customer: names.get(r.customerId as string) || "Unknown customer",
    amount: Number(r.amount ?? 0) / 100,
    currency: String(r.currency ?? "EUR"),
    state: String(r.state),
    invoiceDate: (r.invoiceDate as string) ?? (r.effectiveInvoiceDate as string) ?? null,
    dueDate: (r.dueDate as string) ?? null,
    createdAt: String(r.createdAt),
  }));
});
