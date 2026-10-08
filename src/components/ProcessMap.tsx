import type { PEdge, PNode, Risk } from "@/lib/process";
import { compactEur } from "@/lib/types";
import { cn } from "@/lib/utils";

const W = 128, H = 66;
const riskVar: Record<Risk, string> = { ok: "var(--success)", warn: "var(--warning)", danger: "var(--destructive)", na: "var(--muted-foreground)" };

export type Prediction = { nodeId: string; label: string };

export function ProcessMap({ nodes, edges, selected, onSelect, predictions, showPredictions }: {
  nodes: PNode[]; edges: PEdge[]; selected: string | null; onSelect: (id: string) => void;
  predictions: Prediction[]; showPredictions: boolean;
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const maxCount = Math.max(1, ...edges.map((e) => e.count));
  const allLanes = [
    { y: 18, h: 230, label: "Order-to-Cash", flow: "o2c" },
    { y: 262, h: 112, label: "Procure-to-Pay", flow: "p2p" },
    { y: 388, h: 100, label: "Expense-to-Tax", flow: "e2t" },
  ];
  const lanes = allLanes.filter((l) => nodes.some((n) => n.flow === l.flow));
  // Crop the canvas to the steps that are actually shown so they render large.
  const xs = nodes.map((n) => n.x);
  const minX = Math.max(0, Math.min(...xs, 1330) - W / 2 - 40), maxX = Math.min(1330, Math.max(...xs, 0) + W / 2 + 70);
  const minY = lanes[0]?.y ?? 0, maxY = (lanes.at(-1)?.y ?? 0) + (lanes.at(-1)?.h ?? 500);
  const vb = `${minX - 6} ${minY - 6} ${Math.max(400, maxX - minX + 12)} ${maxY - minY + 12}`;

  return (
    <svg viewBox={vb} className="h-auto w-full select-none" role="img" aria-label="Process map">
      <defs>
        {(["ok", "warn", "danger", "na"] as Risk[]).map((r) => (
          <marker key={r} id={`arrow-${r}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={riskVar[r]} />
          </marker>
        ))}
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="var(--border)" />
        </pattern>
      </defs>
      <rect width="1330" height="500" fill="url(#grid)" />
      {lanes.map((l) => (
        <g key={l.label}>
          <rect x="6" y={l.y} width="1318" height={l.h} rx="10" fill="var(--muted)" opacity="0.35" />
          <text x={minX + 4} y={l.y + 13} className="fill-muted-foreground" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>{l.label}</text>
        </g>
      ))}

      {edges.map((e) => {
        const a = byId.get(e.from)!, b = byId.get(e.to)!;
        const x1 = a.x + W / 2, y1 = a.y, x2 = b.x - W / 2, y2 = b.y;
        const back = x2 < x1;
        const sx = back ? a.x : x1, sy = back ? a.y + H / 2 : y1;
        const ex = back ? b.x : x2, ey = back ? b.y - H / 2 : y2;
        const mx = (sx + ex) / 2;
        const d = back ? `M${sx},${sy} C${sx},${sy + 40} ${ex},${ey - 40} ${ex},${ey}` : `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`;
        const w = e.count ? 1.5 + (e.count / maxCount) * 12 : 1.2;
        const color = riskVar[e.unavailable ? "na" : e.count ? e.risk : "na"];
        const active = selected && (e.from === selected || e.to === selected);
        return (
          <g key={`${e.from}-${e.to}`} opacity={selected && !active ? 0.25 : 1}>
            <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={w + 4} strokeLinecap="round" />
            <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={e.unavailable ? "4 6" : e.count ? "10 8" : "2 6"}
              className={e.count && !e.unavailable ? "flow-dash" : ""} markerEnd={`url(#arrow-${e.unavailable ? "na" : e.count ? e.risk : "na"})`} />
            {e.count > 0 && (
              <g transform={`translate(${(sx + ex) / 2}, ${(sy + ey) / 2 - (back ? 0 : 8)})`}>
                <rect x={-30} y={-9} width={60} height={17} rx={8.5} fill="var(--card)" stroke="var(--border)" />
                <text textAnchor="middle" y={3.5} className="fill-foreground" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                  {e.count}{e.avgDays != null ? ` · ${e.avgDays}d` : ""}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {nodes.map((n) => {
        const isSel = selected === n.id;
        const pred = showPredictions ? predictions.filter((p) => p.nodeId === n.id) : [];
        return (
          <g key={n.id} transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`} onClick={() => onSelect(n.id)} className="cursor-pointer" role="button" aria-label={n.label}
            opacity={selected && !isSel ? 0.75 : 1}>
            <rect width={W} height={H} rx={9} fill="var(--card)" stroke={isSel ? "var(--primary)" : "var(--border)"} strokeWidth={isSel ? 2 : 1}
              strokeDasharray={n.unavailable ? "4 4" : undefined} />
            <rect width={4} height={H - 16} y={8} x={0} rx={2} fill={riskVar[n.risk]} />
            <text x={12} y={17} className="fill-muted-foreground" style={{ fontSize: 10, fontWeight: 500 }}>{n.label}</text>
            {n.unavailable ? (
              <text x={12} y={40} className="fill-muted-foreground" style={{ fontSize: 11 }}>not in API</text>
            ) : (
              <>
                <text x={12} y={39} className="fill-foreground" style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{n.count}</text>
                <text x={W - 10} y={39} textAnchor="end" className="fill-foreground" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{compactEur(n.value)}</text>
                <text x={12} y={56} className="fill-muted-foreground" style={{ fontSize: 9.5, fontFamily: "var(--font-mono)" }}>
                  {n.avgDays != null ? `⌀ ${n.avgDays}d in step` : n.risk === "na" ? "exit" : "—"}
                </text>
              </>
            )}
            {pred.length > 0 && (
              <g transform={`translate(${W / 2}, ${H + 6})`}>
                <rect x={-62} y={0} width={124} height={18} rx={9} fill="var(--primary)" opacity={0.15} stroke="var(--primary)" />
                <text textAnchor="middle" y={12.5} className="fill-primary" style={{ fontSize: 9.5, fontWeight: 600 }}>{pred[0]?.label}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RiskLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground", className)}>
      {([["ok", "flowing"], ["warn", "slowing"], ["danger", "bottleneck"], ["na", "exit"]] as [Risk, string][]).map(([r, l]) => (
        <span key={r} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: riskVar[r] }} />{l}</span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-6 rounded bg-muted-foreground" />thickness = volume</span>
      <span className="font-mono">n · Nd = items · avg transition</span>
    </div>
  );
}
