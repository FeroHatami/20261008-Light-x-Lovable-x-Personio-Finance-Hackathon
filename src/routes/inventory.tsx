import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageCheck, ShoppingCart } from "lucide-react";
import { rowsQuery, snapshotQuery } from "@/lib/queries";
import { createOrder, fulfillOrder, queueApproval, upsertStock } from "@/lib/app.functions";
import { forecast } from "@/lib/analytics";
import { eur, money, toEur } from "@/lib/types";
import { Btn, Kpi, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory & reordering — Flow Cockpit" },
      { name: "description", content: "Stock levels for Light products, order-to-invoice and cash-aware reorder suggestions." },
      { property: "og:title", content: "Inventory & reordering — Flow Cockpit" },
      { property: "og:description", content: "Stock levels for Light products, order-to-invoice and cash-aware reorder suggestions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("stock")), q.prefetchQuery(rowsQuery("orders"))]),
  component: Inventory,
});

function Inventory() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: stock } = useSuspenseQuery(rowsQuery("stock"));
  const { data: orders } = useSuspenseQuery(rowsQuery("orders"));
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["rows"] });
  const byProduct = new Map(stock.map((s) => [s.product_id, s]));
  const fc = useMemo(() => forecast(snap), [snap]);
  const [o, setO] = useState({ customer: "", product: "", qty: 1 });

  const low = stock.filter((s) => Number(s.quantity) <= Number(s.safety_level));

  function cashAdvice(cost: number) {
    const lowest = Math.min(...fc.weeks.map((w) => w.balance));
    if (!snap.settings.starting_cash) return { tone: "warn" as const, text: "Set starting cash in Forecast for timing advice" };
    const firstSafe = fc.weeks.find((w, k) => fc.weeks.slice(k).every((x) => x.balance - cost > 0));
    if (lowest - cost > 0) return { tone: "ok" as const, text: "Order now — cash stays positive" };
    if (firstSafe) return { tone: "warn" as const, text: `Wait until ${firstSafe.label} (${firstSafe.start})` };
    return { tone: "danger" as const, text: "Would push cash negative in the 12-week window" };
  }

  return (
    <div>
      <PageHeader eyebrow="Inventory & reordering" title="Stock, orders and reorders">
        Product catalogue comes from Light ({snap.products.length} products). Light doesn't track stock, so quantities live in the cockpit. Fulfilled orders create draft invoices; low stock creates draft purchase orders — both via the approval queue.
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Products in Light" value={snap.products.length} />
        <Kpi label="Below safety level" value={low.length} tone={low.length ? "danger" : "ok"} />
        <Kpi label="Open orders" value={orders.filter((x) => x.status === "open").length} />
        <Kpi label="Purchase orders in Light" value={snap.purchaseOrders.length} />
      </div>

      <Panel title="Stock levels">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="py-1.5">Product</th><th className="py-1.5">Price</th><th className="py-1.5">On hand</th><th className="py-1.5">Safety</th><th className="py-1.5">Unit cost</th><th className="py-1.5">Vendor</th><th className="py-1.5">Reorder</th></tr>
          </thead>
          <tbody>
            {snap.products.map((p) => <StockRow key={p.id} p={p} s={byProduct.get(p.id)} vendors={snap.vendors} advice={cashAdvice} onSaved={refresh} />)}
          </tbody>
        </table>
      </Panel>

      <Panel title="Orders → invoice" className="mt-4">
        <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <select className={`${inputCls} min-w-56`} value={o.customer} onChange={(e) => setO({ ...o, customer: e.target.value })}>
            <option value="">Customer…</option>{snap.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`${inputCls} min-w-56`} value={o.product} onChange={(e) => setO({ ...o, product: e.target.value })}>
            <option value="">Product…</option>{snap.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" min={1} className={`${inputCls} w-20`} value={o.qty} onChange={(e) => setO({ ...o, qty: Number(e.target.value) })} aria-label="Quantity" />
          <Btn disabled={!o.customer || !o.product || o.qty <= 0} onClick={async () => {
            const c = snap.customers.find((x) => x.id === o.customer)!; const p = snap.products.find((x) => x.id === o.product)!;
            await createOrder({ data: { customer_id: c.id, customer_name: c.name, product_id: p.id, product_name: p.name, quantity: o.qty, unit_price: p.price, currency: p.currency } });
            setO({ customer: "", product: "", qty: 1 }); refresh(); toast.success("Order captured");
          }}>Add order</Btn>
        </div>
        <div className="divide-y divide-border">
          {orders.map((x) => (
            <div key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1"><b>{x.customer_name}</b> · {x.quantity} × {x.product_name}</span>
              <span className="font-mono text-xs">{money(Number(x.quantity) * Number(x.unit_price), x.currency)}</span>
              {x.status === "open" ? (
                <Btn variant="outline" onClick={async () => { try { await fulfillOrder({ data: { id: x.id } }); refresh(); toast.success("Fulfilled — draft invoice sent to approval queue"); } catch (e) { toast.error((e as Error).message); } }}><PackageCheck className="h-3.5 w-3.5" />Mark fulfilled</Btn>
              ) : <Pill tone="ok">fulfilled</Pill>}
            </div>
          ))}
          {orders.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No orders yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

type Stock = { quantity: number; safety_level: number; unit_cost: number; vendor_id: string | null };
function StockRow({ p, s, vendors, advice, onSaved }: { p: { id: string; name: string; price: number; currency: string }; s?: Stock; vendors: { id: string; name: string }[]; advice: (c: number) => { tone: "ok" | "warn" | "danger"; text: string }; onSaved: () => void }) {
  const [q, setQ] = useState(String(s?.quantity ?? 0));
  const [safety, setSafety] = useState(String(s?.safety_level ?? 0));
  const [cost, setCost] = useState(String(s?.unit_cost ?? 0));
  const [vendor, setVendor] = useState(s?.vendor_id ?? "");
  const dirty = String(s?.quantity ?? 0) !== q || String(s?.safety_level ?? 0) !== safety || String(s?.unit_cost ?? 0) !== cost || (s?.vendor_id ?? "") !== vendor;
  const isLow = s && Number(s.quantity) <= Number(s.safety_level) && Number(s.safety_level) > 0;
  const reorderQty = Math.max(1, Number(safety) * 2 - Number(q));
  const a = advice(toEur(reorderQty * Number(cost), p.currency));
  const save = async () => { await upsertStock({ data: { product_id: p.id, product_name: p.name, quantity: Number(q), safety_level: Number(safety), unit_cost: Number(cost), vendor_id: vendor || null } }); onSaved(); toast.success("Saved"); };

  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2 font-medium">{p.name}</td>
      <td className="py-1.5 font-mono text-xs">{money(p.price, p.currency)}</td>
      <td className="py-1.5"><input className={`${inputCls} w-20 ${isLow ? "border-destructive" : ""}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="On hand" /></td>
      <td className="py-1.5"><input className={`${inputCls} w-20`} value={safety} onChange={(e) => setSafety(e.target.value)} aria-label="Safety level" /></td>
      <td className="py-1.5"><input className={`${inputCls} w-20`} value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Unit cost" /></td>
      <td className="py-1.5"><select className={`${inputCls} w-40`} value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Vendor"><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td>
      <td className="py-1.5">
        <div className="flex items-center gap-2">
          {dirty && <Btn variant="outline" onClick={save}>Save</Btn>}
          {isLow && !dirty && (
            <>
              <Pill tone={a.tone}>{a.text}</Pill>
              <Btn disabled={!vendor} title={vendor ? "" : "Pick a vendor first"} onClick={async () => {
                await queueApproval({ data: { kind: "draft_po", source: "inventory", title: `Reorder ${reorderQty} × ${p.name}`, summary: `${eur(toEur(reorderQty * Number(cost), p.currency))} · ${a.text}`,
                  payload: { vendorId: vendor, vendorName: vendors.find((v) => v.id === vendor)?.name, productId: p.id, productName: p.name, quantity: reorderQty, unitCost: Number(cost), currency: p.currency } } });
                toast.success("Draft PO sent to approval queue"); onSaved();
              }}><ShoppingCart className="h-3.5 w-3.5" />Draft PO</Btn>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
