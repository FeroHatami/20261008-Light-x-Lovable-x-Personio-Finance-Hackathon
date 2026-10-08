import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CheckSquare, LineChart, Megaphone, FilePlus2, FlaskConical, MessageSquare, Moon, Sun, Workflow, LogOut, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { demoSignIn } from "@/lib/app.functions";
import { rowsQuery } from "@/lib/queries";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

type NavItem = { to: NonNullable<LinkProps["to"]>; label: string; icon: typeof Workflow };
const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: Workflow },
  { to: "/collections", label: "Collections", icon: Megaphone },
  { to: "/what-if", label: "What-if", icon: FlaskConical },
  { to: "/forecast", label: "Forecast", icon: LineChart },
  { to: "/new-invoice", label: "Invoice from anything", icon: FilePlus2 },
  { to: "/ask", label: "Ask your finances", icon: MessageSquare },
];

export function AppShell({ children, user }: { children: ReactNode; user: { name: string; demo?: boolean } | null }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(true);
  useEffect(() => { const s = localStorage.getItem("theme"); setDark(s ? s === "dark" : true); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("theme", dark ? "dark" : "light"); }, [dark]);

  if (path.startsWith("/portal/")) return <div className="min-h-screen bg-background text-foreground">{children}</div>;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"><Workflow className="h-4 w-4" /></div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Flow Cockpit</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">on Light</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <div className="mt-3 space-y-0.5">
            {NAV.map((n) => (
              <Link key={String(n.to)} to={n.to} activeOptions={{ exact: true }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-foreground font-medium" }}>
                <n.icon className="h-4 w-4 opacity-80" />{n.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-semibold">{user?.name?.[0]?.toUpperCase() ?? "?"}</div>
          <p className="flex-1 truncate text-xs text-muted-foreground">{user?.name ?? "Not signed in"}</p>
          <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {user?.demo && <button onClick={() => supabase.auth.signOut()} aria-label="Sign out" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><LogOut className="h-4 w-4" /></button>}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={String(n.to)} to={n.to} activeOptions={{ exact: true }} className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-muted-foreground" activeProps={{ className: "bg-accent !text-foreground" }}>{n.label}</Link>
          ))}
        </div>
        {user && <TopBar />}
        {user ? <main className="mx-auto max-w-[1400px] px-5 py-6 lg:px-8">{children}</main> : <SignedOut />}
      </div>
    </div>
  );
}

function TopBar() {
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery(rowsQuery("approvals"));
  const pending = data.filter((a) => a.status === "pending").length;
  return (
    <div className="flex h-12 items-center justify-end gap-2 border-b border-border px-5 lg:px-8">
      <button onClick={() => setOpen(true)} className="relative inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
        <CheckSquare className="h-4 w-4" />Approvals
        <span className={"min-w-5 rounded-full px-1.5 text-center font-mono text-xs " + (pending ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{pending}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Approval queue</SheetTitle>
            <SheetDescription>Nothing reaches Light without your click. Invoices are created as drafts only; reminder emails are logged, never sent.</SheetDescription>
          </SheetHeader>
          <div className="mt-4"><ApprovalQueue compact /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SignedOut() {
  const [busy, setBusy] = useState(false);
  async function demo() {
    setBusy(true);
    try {
      const t = await demoSignIn();
      const { error } = await supabase.auth.setSession(t);
      if (error) throw error;
    } catch (e) { toast.error((e as Error).message || "Demo sign-in failed"); setBusy(false); }
  }
  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Welcome to Flow Cockpit</h1>
        <p className="mt-2 text-sm text-muted-foreground">Live finance process intelligence on Light. Open the demo with one click — no account or password needed.</p>
        <button onClick={demo} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
          <Sparkles className="h-4 w-4" />{busy ? "Opening…" : "Continue as demo user"}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">Any change you make stays a draft until approved. Nothing is sent to customers.</p>
      </div>
    </div>
  );
}
