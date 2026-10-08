import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, right, children, className }: { title?: string | undefined; right?: ReactNode; children: ReactNode; className?: string | undefined }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode | undefined; tone?: "danger" | "warn" | "ok" | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tabular-nums",
        tone === "danger" && "text-destructive", tone === "warn" && "text-warning", tone === "ok" && "text-success")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "danger" | "warn" | "ok" | "info" | undefined }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
      !tone && "border-border bg-secondary text-secondary-foreground",
      tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
      tone === "warn" && "border-warning/30 bg-warning/10 text-warning",
      tone === "ok" && "border-success/30 bg-success/10 text-success",
      tone === "info" && "border-primary/30 bg-primary/10 text-primary")}>{children}</span>
  );
}

export function Btn({ children, variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  return (
    <button {...p} className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
      variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
      variant === "outline" && "border border-border bg-background hover:bg-accent",
      variant === "ghost" && "text-muted-foreground hover:bg-accent hover:text-foreground",
      variant === "danger" && "border border-destructive/40 text-destructive hover:bg-destructive/10", className)}>{children}</button>
  );
}

export const inputCls = "h-8 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function stateLabel(s: string) { return s.replace(/_/g, " ").toLowerCase(); }
