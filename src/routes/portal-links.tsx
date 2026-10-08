import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { rowsQuery, snapshotQuery } from "@/lib/queries";
import { createPortalLink, deleteRow } from "@/lib/app.functions";
import { isOpen } from "@/lib/analytics";
import { money } from "@/lib/types";
import { Btn, Empty, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/portal-links")({
  head: () => ({
    meta: [
      { title: "Customer portal — Flow Cockpit" },
      { name: "description", content: "Secure per-invoice links where customers accept discounts, plans or raise disputes." },
      { property: "og:title", content: "Customer portal — Flow Cockpit" },
      { property: "og:description", content: "Secure per-invoice links where customers accept discounts, plans or raise disputes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("portal_links"))]),
  component: PortalLinks,
});

function PortalLinks() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: links } = useSuspenseQuery(rowsQuery("portal_links"));
  const qc = useQueryClient();
  const openInv = snap.invoices.filter(isOpen);
  const [invId, setInvId] = useState("");
  const [discount, setDiscount] = useState(2);
  const [plan, setPlan] = useState(3);
  const url = (t: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${t}`;

  async function create() {
    const i = openInv.find((x) => x.id === invId); if (!i) return;
    await createPortalLink({ data: { invoice_id: i.id, customer: i.customer, amount: i.amount - i.paidAmount, currency: i.currency, due_date: i.dueDate, discount_pct: Math.min(5, discount), installments: plan } });
    qc.invalidateQueries({ queryKey: ["rows", "portal_links"] }); toast.success("Link created");
  }

  return (
    <div>
      <PageHeader eyebrow="Customer portal" title="Self-service links for customers">
        Each link opens a private page for one invoice. Customers can accept an early-payment discount, choose an installment plan or raise a dispute. Responses are logged and feed the forecast; nothing changes in Light automatically.
      </PageHeader>
      <Panel title="New link" className="mb-4">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="min-w-72 flex-1"><span className="text-xs text-muted-foreground">Invoice</span>
            <select className={`${inputCls} mt-1 w-full`} value={invId} onChange={(e) => setInvId(e.target.value)}>
              <option value="">— choose an open invoice —</option>
              {openInv.map((i) => <option key={i.id} value={i.id}>{i.customer} · {i.number ?? "—"} · {money(i.amount - i.paidAmount, i.currency)}</option>)}
            </select></label>
          <label><span className="text-xs text-muted-foreground">Discount % (max 5)</span><input type="number" min={0} max={5} step={0.5} className={`${inputCls} mt-1 block w-24`} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></label>
          <label><span className="text-xs text-muted-foreground">Installments</span><input type="number" min={0} max={12} className={`${inputCls} mt-1 block w-24`} value={plan} onChange={(e) => setPlan(Number(e.target.value))} /></label>
          <Btn disabled={!invId} onClick={create}>Create link</Btn>
        </div>
      </Panel>
      {links.length === 0 ? <Empty>No links yet. You can also create them from Collections.</Empty> : (
        <Panel title="Links">
          <div className="divide-y divide-border">
            {links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.customer} <span className="font-mono text-xs text-muted-foreground">{money(Number(l.amount), l.currency)}</span></p>
                  <p className="text-xs text-muted-foreground">{l.discount_pct}% early-pay · {l.installments || "no"} installments · created {l.created_at.slice(0, 10)}</p>
                  {l.response_note && <p className="mt-0.5 text-xs">“{l.response_note}”</p>}
                </div>
                {l.response ? <Pill tone={l.response === "dispute" ? "danger" : "ok"}>{l.response}</Pill> : <Pill>awaiting customer</Pill>}
                <Link to="/portal/$token" params={{ token: l.token }} target="_blank" className="text-xs text-primary underline">Preview</Link>
                <button aria-label="Copy link" className="text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(url(l.token)); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></button>
                <button aria-label="Delete link" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteRow({ data: { table: "portal_links", id: l.id } }); qc.invalidateQueries({ queryKey: ["rows", "portal_links"] }); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
