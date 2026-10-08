// Client-safe shared types and helpers.
export type Inv = {
  id: string;
  number: string | null;
  customerId: string;
  customer: string;
  description: string;
  amount: number;        // in invoice currency (major units)
  amountEur: number;     // approx EUR
  currency: string;
  state: string;
  invoiceDate: string | null;
  dueDate: string | null;
  createdAt: string;
  openedAt: string | null;
  paidAmount: number;    // major units, from Light payments
  lastPaymentDate: string | null;
};
export type Customer = { id: string; name: string; email: string | null };
export type Vendor = { id: string; name: string };
export type Product = { id: string; name: string; price: number; currency: string };
export type PO = { id: string; state: string; total: number; date: string | null; vendorId: string | null };
export type Expense = { id: string; status: string; date: string | null; amount: number; currency: string; amountEur: number; description: string };
export type Settings = { starting_cash: number; monthly_fixed_costs: number };

export type Snapshot = {
  fetchedAt: string;
  invoices: Inv[];
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  purchaseOrders: PO[];
  expenses: Expense[];
  settings: Settings;
  bills: { id: string; number: string | null; vendor: string; state: string; amount: number; currency: string; amountEur: number; issuedDate: string | null; dueDate: string | null }[];
  bankBalances: { id: string; name: string; currency: string; amount: number; amountEur: number; source: "bank" | "ledger" }[];
  unavailable: string[];
};

export const FX_TO_EUR: Record<string, number> = { EUR: 1, DKK: 0.134, USD: 0.92, GBP: 1.17, SEK: 0.087, CHF: 1.05, NOK: 0.085 };
export const toEur = (amount: number, currency: string) => amount * (FX_TO_EUR[currency] ?? 1);

export const eur = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: digits }).format(n);
export const money = (n: number, c: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);
export const compactEur = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(n);
