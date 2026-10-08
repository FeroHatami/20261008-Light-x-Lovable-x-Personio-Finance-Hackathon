import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Phone, Link2 } from "lucide-react";
import { snapshotQuery, rowsQuery } from "@/lib/queries";
import { computeVelocity, daysOverdue, isOpen, remainingEur, todayIso, addDays } from "@/lib/analytics";
import { draftReminder } from "@/lib/ai.functions";
import { addFollowUp, createPortalLink, queueApproval } from "@/lib/app.functions";
import { eur, money } from "@/lib/types";
import type { Inv } from "@/lib/types";
import { Btn, Kpi, PageHeader, Panel, Pill, inputCls } from "@/components/ui-kit";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "Collections autopilot — Flow Cockpit" },
      { name: "description", content: "Who to chase today, AI reminder drafts with escalating tone, and follow-up tracking." },
      { property: "og:title", content: "Collections autopilot — Flow Cockpit" },
      { property: "og:description", content: "Who to chase today, AI reminder drafts with escalating tone, and follow-up tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient: q, me } }) => !me ? undefined : Promise.all([q.prefetchQuery(snapshotQuery), q.prefetchQuery(rowsQuery("follow_ups"))]),
  validateSearch: (s: Record<string, unknown>): { focus?: string } => (typeof s["focus"] === "string" ? { focus: s["focus"] } : {}),
  component: Collections,
});

const toneFor = (d: number) => (d <= 7 ? "friendly nudge" : d <= 30 ? "clear reminder" : d <= 60 ? "firm notice" : "final notice");

function Collections() {
  const { data: snap } = useSuspenseQuery(snapshotQuery);
  const { data: follow } = useSuspenseQuery(rowsQuery("follow_ups"));
  const qc = useQueryClient();
  const { focus } = Route.useSearch();
  const today = todayIso();
  const vel = useMemo(() => new Map(computeVelocity(snap.invoices).rows.map((r) => [r.customerId, r])), [snap]);
  const lastTouch = useMemo(() => {
    const m = new Map<string, (typeof follow)[number]>();
    follow.forEach((f) => { if (!m.has(f.invoice_id)) m.set(f.invoice_id, f); });
    return m;
  }, [follow]);

  const ranked = useMemo(() => snap.invoices
    
    .filter((i) => isOpen(i) && (i.id === focus || daysOverdue(i) > 0 || (i.dueDate && i.dueDate <= addDays(today, 7))))
    .map((i) => {
      const d = daysOverdue(i); const v = vel.get(i.customerId);
      const score = remainingEur(i) * (1 + d / 30) * (1 - (v?.reliability ?? 50) / 200);
      const ft = lastTouch.get(i.id);
      const snoozed = ft?.next_touch && ft.next_touch > today;
      return { i, d, v, score, ft, snoozed };
    })
    .sort((a, b) => Number(!!a.snoozed) - Number(!!b.snoozed) || b.score - a.score), [snap, vel, lastTouch, today, focus]);

  const [open, setOpen] = useState<string | null>(focus ?? null);
  useEffect(() => {
    if (!focus) return;
    setOpen(focus);
    requestAnimationFrame(() => document.getElementById(`inv-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focus]);
  const due = ranked.filter((r) => !r.snoozed);

  return (
    <div>
      <PageHeader eyebrow="Collections autopilot" title="Who to chase today">
        Ranked by amount, days overdue and the customer's payment behaviour. Drafts go to the approval queue — nothing is emailed to customers.
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="To chase today" value={due.length} />
        <Kpi label="Overdue value" value={eur(ranked.reduce((s, r) => s + (r.d > 0 ? remainingEur(r.i) : 0), 0))} tone="danger" />
        <Kpi label="Promised payments" value={follow.filter((f) => f.promised_date && f.promised_date >= today).length} sub="feed the forecast" tone="ok" />
        <Kpi label="Snoozed (next touch later)" value={ranked.length - due.length} />
      </div>
      <Panel title="Priority list">
        <div className="divide-y divide-border">
          {ranked.map(({ i, d, v, ft, snoozed }, k) => (
            <div key={i.id} id={`inv-${i.id}`} className={`${snoozed ? "opacity-60" : ""} ${i.id === focus ? "rounded-md bg-primary/5" : ""}`}>
              <div className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-6 font-mono text-xs text-muted-foreground">{k + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.customer} <span className="text-sm font-normal text-muted-foreground">{i.number ?? ""}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {d > 0 ? `${d} days overdue` : `due ${i.dueDate}`} · usually {v?.avgDaysLate ?? "?"}d late · reliability {v?.reliability ?? "?"}
                    {ft ? ` · last touch ${ft.created_at.slice(0, 10)}${ft.next_touch ? `, next ${ft.next_touch}` : ""}` : ""}
                  </p>
                </div>
                <Pill tone={d > 60 ? "danger" : d > 7 ? "warn" : "info"}>{toneFor(d)}</Pill>
                <span className="w-28 text-right font-mono text-sm">{money(i.amount - i.paidAmount, i.currency)}</span>
                <Btn variant={open === i.id ? "outline" : "primary"} onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? "Close" : "Work it"}</Btn>
              </div>
              {open === i.id && <Workbench inv={i} d={d} history={`${v?.customer}: avg ${v?.avgDaysLate}d late, reliability ${v?.reliability}/100, ${v?.overdueCount} overdue invoices`} onDone={() => qc.invalidateQueries({ queryKey: ["rows"] })} />}
            </div>
          ))}
          {ranked.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing to chase. 🎉</p>}
        </div>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Promises and portal responses update the forecast's follow-up data. Drafts wait in the Approvals badge at the top.</p>
    </div>
  );
}

function Workbench({ inv, d, history, onDone }: { inv: Inv; d: number; history: string; onDone: () => void }) {
  const [tone, setTone] = useState(toneFor(d));
  const [mail, setMail] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [promised, setPromised] = useState("");
  const [discount, setDiscount] = useState(2);
  const [plan, setPlan] = useState(3);
  const [link, setLink] = useState<string | null>(null);
  const amount = money(inv.amount - inv.paidAmount, inv.currency);

  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); } };

  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <select className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)}>
            {["friendly nudge", "clear reminder", "firm notice", "final notice"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <Btn disabled={!!busy} onClick={() => run("draft", async () => setMail(await draftReminder({ data: { customer: inv.customer, number: inv.number, amount, dueDate: inv.dueDate, daysOverdue: d, tone, history } })))}>
            <Sparkles className="h-3.5 w-3.5" />{busy === "draft" ? "Drafting…" : "Draft with AI"}
          </Btn>
        </div>
        {mail && (
          <div className="mt-2 space-y-2">
            <input className={`${inputCls} w-full`} value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            <textarea className="min-h-40 w-full rounded-md border border-input bg-background p-2.5 text-sm" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
            <Btn disabled={!!busy} onClick={() => run("queue", async () => {
              await queueApproval({ data: { kind: "reminder_email", source: "collections", title: `Reminder to ${inv.customer} (${tone})`, summary: `${amount} · ${d} days overdue`, payload: { ...mail, invoiceId: inv.id, customer: inv.customer, tone } } });
              toast.success("Sent to approval queue"); setMail(null); onDone();
            })}>Send to approval queue</Btn>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Phone className="h-3.5 w-3.5" />Log follow-up</p>
          <input className={`${inputCls} w-full`} placeholder="Called, promised payment…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-1.5 flex gap-2">
            <input type="date" className={`${inputCls} flex-1`} value={promised} onChange={(e) => setPromised(e.target.value)} aria-label="Promised date" />
            <Btn variant="outline" disabled={!note || !!busy} onClick={() => run("log", async () => {
              await addFollowUp({ data: { invoice_id: inv.id, customer: inv.customer, note, promised_date: promised || null, next_touch: promised || addDays(todayIso(), 7) } });
              toast.success("Logged"); setNote(""); onDone();
            })}>Log</Btn>
          </div>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Link2 className="h-3.5 w-3.5" />Portal offer</p>
          <div className="flex items-center gap-2 text-xs">
            <label>Discount <input type="number" min={0} max={5} step={0.5} className={`${inputCls} w-16`} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />%</label>
            <label>Plan <input type="number" min={0} max={12} className={`${inputCls} w-14`} value={plan} onChange={(e) => setPlan(Number(e.target.value))} /> parts</label>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Guardrail: discount capped at 5%.</p>
          <Btn variant="outline" className="mt-1.5" disabled={!!busy} onClick={() => run("link", async () => {
            const r = await createPortalLink({ data: { invoice_id: inv.id, customer: inv.customer, amount: inv.amount - inv.paidAmount, currency: inv.currency, due_date: inv.dueDate, discount_pct: Math.min(5, discount), installments: plan } });
            const url = `${window.location.origin}/portal/${r.token}`;
            setLink(url);
            try { await navigator.clipboard.writeText(url); toast.success("Customer link copied"); } catch { /* clipboard blocked */ }
            window.open(url, "_blank", "noopener");
            onDone();
          })}>Copy customer link</Btn>
          {link && <a href={link} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-primary underline">{link}</a>}
        </div>
      </div>
    </div>
  );
}
