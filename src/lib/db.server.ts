// Server-only: resolves the viewer from either door — the Lovable identity header, or the demo
// account's Cloud session bearer — and returns a database client acting as that user (RLS applies).
import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

export type Viewer = { userId: string; name: string; email: string | null; door: "lovable" | "demo" };

function makeDb(token: string) {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function resolveViewer(): Promise<{ user: Viewer; db: ReturnType<typeof makeDb> } | null> {
  const req = getRequest();
  const idToken = req?.headers.get("x-lovable-identity-token");
  if (idToken) {
    const { getSessionUser } = await import("./auth.server");
    const u: any = await getSessionUser();
    if (u) return { user: { userId: u.userId, name: u.displayName ?? u.email ?? "You", email: u.email ?? null, door: "lovable" }, db: makeDb(idToken) };
  }
  const auth = req?.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearer && !bearer.startsWith("sb_")) {
    const authClient = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.getUser(bearer);
    const db = makeDb(bearer);
    if (!error && data.user) {
      const meta: any = data.user.user_metadata ?? {};
      return { user: { userId: data.user.id, name: meta.display_name ?? "Demo judge", email: data.user.email ?? null, door: "demo" }, db };
    }
  }
  return null;
}

export async function requireUser() {
  const v = await resolveViewer();
  if (!v) throw new Error("Please sign in to use the cockpit.");
  return v;
}

export async function audit(db: Awaited<ReturnType<typeof requireUser>>["db"], action: string, detail: Record<string, unknown> = {}) {
  await db.from("audit_log").insert({ action, detail: detail as never });
}
