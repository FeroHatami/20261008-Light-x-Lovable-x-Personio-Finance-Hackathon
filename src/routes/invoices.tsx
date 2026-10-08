import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getInvoices, type Invoice } from "@/lib/light.functions";
import { PageHeader } from "@/components/ui-kit";

const invoicesQuery = queryOptions({ queryKey: ["invoices"], queryFn: () => getInvoices() });

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Receivables Dashboard — Light" },
      { name: "description", content: "Outstanding and overdue sales invoices from Light." },
      { property: "og:title", content: "Receivables Dashboard — Light" },
      { property: "og:description", content: "Outstanding and overdue sales invoices from Light." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(invoicesQuery),
  component: Index,
});

const STATES = ["ALL", "DRAFT", "OPEN", "PARTIALLY_PAID", "CREATED", "OPEN_IN_PROGRESS", "PAYMENT_PENDING"];
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (i: Invoice) => !!i.dueDate && i.dueDate < today() && i.state !== "DRAFT";

function money(n: number, c: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(n);
}
function totals(list: Invoice[]) {
  const m = new Map<string, number>();
  list.forEach((i) => m.set(i.currency, (m.get(i.currency) ?? 0) + i.amount));
  return [...m.entries()].map(([c, v]) => money(v, c));
}

function Index() {
  const { data } = useSuspenseQuery(invoicesQuery);
  const [state, setState] = useState("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      data.filter(
        (i) =>
          (state === "ALL" || i.state === state) &&
          (i.customer + (i.number ?? "")).toLowerCase().includes(q.toLowerCase()),
      ),
    [data, state, q],
  );
  const nonDraft = data.filter((i) => i.state !== "DRAFT");
  const overdue = data.filter(isOverdue);

  return (
    <main>
      <div>
        <PageHeader eyebrow="Light · Receivables" title="Who owes you money">Open invoices exactly as Light shows them, newest first.</PageHeader>

        <section className="grid gap-4 sm:grid-cols-3">
          <Stat label="Outstanding (excl. drafts)" values={totals(nonDraft)} />
          <Stat label="Overdue" values={totals(overdue)} danger />
          <Stat label="Open invoices" values={[String(data.length)]} />
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer or number"
            className="h-10 flex-1 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All statuses" : s.replace(/_/g, " ").toLowerCase()}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Invoice date</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{i.customer}</td>
                  <td className="px-4 py-3 text-muted-foreground">{i.number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {i.state.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{i.invoiceDate ?? "—"}</td>
                  <td className={`px-4 py-3 ${isOverdue(i) ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    {i.dueDate ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(i.amount, i.currency)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No invoices match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, values, danger }: { label: string; values: string[]; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={`mt-2 space-y-0.5 text-xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>
        {values.length ? values.map((v) => <div key={v}>{v}</div>) : <div>—</div>}
      </div>
    </div>
  );
}
