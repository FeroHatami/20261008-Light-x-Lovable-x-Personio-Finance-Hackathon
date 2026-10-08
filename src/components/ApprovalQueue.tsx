import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Mail, FileText, ShoppingCart, Lightbulb } from "lucide-react";
import { rowsQuery } from "@/lib/queries";
import { decideApproval } from "@/lib/app.functions";
import { Btn, Empty, PageHeader, Panel, Pill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Mail> = { reminder_email: Mail, draft_invoice: FileText, draft_po: ShoppingCart, recommendation: Lightbulb };
const KIND: Record<string, string> = { reminder_email: "Reminder email", draft_invoice: "Draft invoice → Light", draft_po: "Draft PO → Light", recommendation: "Recommendation" };

export function ApprovalQueue({ compact = false }: { compact?: boolean }) {
  const { data = [] } = useQuery(rowsQuery("approvals"));
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const list = data.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending"));

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const r = await decideApproval({ data: { id, decision } });
      if (r.status === "failed") toast.error(`Light rejected it: ${(r as { result?: { error?: string } }).result?.error ?? "unknown error"}`);
      else toast.success(decision === "approve" ? "Approved and logged" : "Rejected");
      await Promise.all([qc.invalidateQueries({ queryKey: ["rows"] }), qc.invalidateQueries({ queryKey: ["snapshot"] })]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div>
      {!compact && <PageHeader eyebrow="Control" title="Approval queue">
        Nothing reaches Light or a customer without your click. Invoices and purchase orders are created in Light as drafts only; reminder emails are logged, never sent.
      </PageHeader>}
      <div className="mb-3 flex gap-1">
        {(["pending", "done"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-accent font-medium" : "text-muted-foreground")}>
            {t === "pending" ? `Pending (${data.filter((a) => a.status === "pending").length})` : "Decided"}
          </button>
        ))}
      </div>
      {list.length === 0 ? <Empty>{tab === "pending" ? "Queue is clear. Drafts from Collections, Invoice from anything, What-if and Inventory land here." : "No decisions yet."}</Empty> : (
        <div className="space-y-3">
          {list.map((a) => {
            const Icon = ICON[a.kind] ?? Lightbulb;
            const p = a.payload ?? {};
            return (
              <Panel key={a.id}>
                <div className={cn("flex items-start gap-3", compact ? "flex-col" : "flex-wrap")}>
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-accent"><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.title}</p>
                      <Pill tone="info">{KIND[a.kind] ?? a.kind}</Pill>
                      {a.status !== "pending" && <Pill tone={a.status === "approved" ? "ok" : a.status === "failed" ? "danger" : undefined}>{a.status}</Pill>}
                    </div>
                    {a.summary && <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>}
                    {a.kind === "reminder_email" && (
                      <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                        <p className="font-medium">Subject: {p.subject}</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{p.body}</p>
                      </div>
                    )}
                    {(a.kind === "draft_invoice") && (
                      <div className="mt-2 text-sm">
                        <p className="text-muted-foreground">{p.customer} · {p.currency} · {p.netTerms ?? 30}-day terms</p>
                        <ul className="mt-1 space-y-0.5 font-mono text-xs">
                          {(p.lines ?? []).map((l: { description: string; quantity: number; unitPrice: number }, k: number) => <li key={k}>{l.quantity} × {l.description} @ {l.unitPrice}</li>)}
                        </ul>
                      </div>
                    )}
                    {a.kind === "draft_po" && <p className="mt-2 font-mono text-xs">{p.quantity} × {p.productName} @ {p.unitCost} {p.currency ?? "EUR"} · vendor {p.vendorName ?? p.vendorId}</p>}
                    {a.result && <p className="mt-2 text-xs text-muted-foreground">Result: {a.result.error ?? a.result.note ?? (a.result.lightId ? `Created in Light as ${a.result.state ?? "draft"} (${String(a.result.lightId).slice(0, 8)})` : "done")}{a.result.note && a.result.lightId ? ` · ${String(a.result.lightId).slice(0, 8)}` : ""}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("en-GB")} · from {a.source ?? "cockpit"}</p>
                  </div>
                  {a.status === "pending" && (
                    <div className="flex gap-2">
                      <Btn variant="outline" disabled={busy === a.id} onClick={() => decide(a.id, "reject")}><X className="h-3.5 w-3.5" />Reject</Btn>
                      <Btn disabled={busy === a.id} onClick={() => decide(a.id, "approve")}><Check className="h-3.5 w-3.5" />{busy === a.id ? "Working…" : "Approve"}</Btn>
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
