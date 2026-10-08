import { queryOptions } from "@tanstack/react-query";
import { getSnapshot } from "./snapshot.functions";
import { listRows } from "./app.functions";

export const snapshotQuery = queryOptions({ queryKey: ["snapshot"], queryFn: () => getSnapshot(), staleTime: 60_000 });

type Table = "approvals" | "audit_log" | "follow_ups" | "scenarios" | "stock" | "orders" | "expense_checks" | "portal_links";
export const rowsQuery = (table: Table) =>
  queryOptions({ queryKey: ["rows", table], queryFn: () => listRows({ data: { table } }), staleTime: 15_000 });
