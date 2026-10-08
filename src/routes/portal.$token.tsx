import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getPortal, respondPortal } from "@/lib/app.functions";
import { money } from "@/lib/types";

export const Route = createFileRoute("/portal/$token")({
  head: () => ({
    meta: [
      { title: "Your invoice — payment options" },
      { name: "description", content: "View payment options for your invoice." },
      { property: "og:title", content: "Your invoice — payment options" },
      { property: "og:description", content: "View payment options for your invoice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ params }) => (/^[a-f0-9]{36}$/.test(params.token) ? getPortal({ data: { token: params.token } }) : null),
  component: Portal,
});

function Portal() {
  const link = Route.useLoaderData();
  const { token } = Route.useParams();
  const [choice, setChoice] = useState<"discount" | "plan" | "dispute" | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(link?.response ?? null);
  const [err, setErr] = useState("");

  if (!link) return <Shell><p className="text-center text-sm text-muted-foreground">This link is invalid or has been removed.</p></Shell>;
  const amount = Number(link.amount);
  const disc = amount * (1 - Number(link.discount_pct) / 100);

  if (done) return <Shell><div className="text-center"><p className="text-lg font-semibold">Thank you</p><p className="mt-1 text-sm text-muted-foreground">Your response ({done}) has been recorded. The team will follow up.</p></div></Shell>;

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice for {link.customer}</p>
      <p className="mt-1 font-mono text-3xl font-semibold">{money(amount, link.currency ?? "EUR")}</p>
      <p className="text-sm text-muted-foreground">{link.due_date ? `Due ${link.due_date}` : ""}</p>
      <div className="mt-6 space-y-2">
        {Number(link.discount_pct) > 0 && (
          <Opt active={choice === "discount"} onClick={() => setChoice("discount")} title={`Pay within ${link.discount_hours}h and save ${link.discount_pct}%`} sub={`Pay ${money(disc, link.currency ?? "EUR")} instead of ${money(amount, link.currency ?? "EUR")}`} />
        )}
        {link.installments > 1 && (
          <Opt active={choice === "plan"} onClick={() => setChoice("plan")} title={`Split into ${link.installments} monthly payments`} sub={`${link.installments} × ${money(amount / link.installments, link.currency ?? "EUR")}`} />
        )}
        <Opt active={choice === "dispute"} onClick={() => setChoice("dispute")} title="Something's wrong with this invoice" sub="Tell us what needs fixing" />
      </div>
      {choice && (
        <div className="mt-4">
          <textarea className="min-h-24 w-full rounded-md border border-input bg-background p-2.5 text-sm" placeholder={choice === "dispute" ? "What's wrong?" : "Optional note"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
          <button className="mt-2 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={choice === "dispute" && !note.trim()}
            onClick={async () => { try { await respondPortal({ data: { token, response: choice, note } }); setDone(choice); } catch (e) { setErr((e as Error).message); } }}>Confirm</button>
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-muted-foreground">Payment details are on your original invoice. No payment is taken on this page.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background px-4"><div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div></div>;
}
function Opt({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>
      <p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}
