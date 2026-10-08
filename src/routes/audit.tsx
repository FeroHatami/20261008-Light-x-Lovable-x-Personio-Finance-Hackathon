import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rowsQuery } from "@/lib/queries";
import { Empty, PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Flow Cockpit" },
      { name: "description", content: "Every approval, write to Light and customer response, in order." },
      { property: "og:title", content: "Audit log — Flow Cockpit" },
      { property: "og:description", content: "Every approval, write to Light and customer response, in order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(rowsQuery("audit_log")),
  component: Audit,
});

function Audit() {
  const { data } = useSuspenseQuery(rowsQuery("audit_log"));
  return (
    <div>
      <PageHeader eyebrow="Trail" title="Audit log">Newest first. Entries can't be edited from the app.</PageHeader>
      {data.length === 0 ? <Empty>No activity yet.</Empty> : (
        <Panel>
          <ol className="space-y-0">
            {data.map((r) => (
              <li key={r.id} className="grid grid-cols-[150px_200px_1fr] gap-3 border-t border-border py-2 text-sm first:border-t-0">
                <span className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</span>
                <span className="font-mono text-xs text-primary">{r.action}</span>
                <span className="truncate text-xs text-muted-foreground">{JSON.stringify(r.detail)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
