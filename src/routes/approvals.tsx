import { createFileRoute } from "@tanstack/react-router";
import { rowsQuery } from "@/lib/queries";
import { ApprovalQueue } from "@/components/ApprovalQueue";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approval queue — Flow Cockpit" },
      { name: "description", content: "Every AI draft waits here for one-click approval before anything is written to Light." },
      { property: "og:title", content: "Approval queue — Flow Cockpit" },
      { property: "og:description", content: "Every AI draft waits here for one-click approval before anything is written to Light." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => !context.me ? undefined : context.queryClient.prefetchQuery(rowsQuery("approvals")),
  component: () => <ApprovalQueue />,
});

