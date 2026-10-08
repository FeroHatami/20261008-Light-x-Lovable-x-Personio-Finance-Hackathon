import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getDataHealth } from "@/lib/health.functions";

const healthQuery = queryOptions({ queryKey: ["health"], queryFn: () => getDataHealth() });

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Data health — Flow Cockpit" },
      { name: "description", content: "Which Light data sources are reachable and how many records each holds." },
      { property: "og:title", content: "Data health — Flow Cockpit" },
      { property: "og:description", content: "Which Light data sources are reachable and how many records each holds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(healthQuery),
  component: Health,
});

function Health() {
  const { data } = useSuspenseQuery(healthQuery);
  return (
    <main>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Light · Connection</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Data health</h1>
      <p className="mt-1 text-sm text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleString("en-GB")}</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Records</th>
              <th className="px-4 py-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.path} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.ok ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}`}>
                    {r.ok ? "connected" : "unavailable"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.count ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
