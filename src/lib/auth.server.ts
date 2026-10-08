import { getRequest } from "@tanstack/react-start/server";

import { type SessionUser, verifyIdentityToken } from "./identity-jwt";

export type { SessionUser };

export async function getEnv(): Promise<Record<string, string | undefined>> {
  // In deployed Cloudflare Workers, env bindings are passed via the fetch handler's
  // env parameter — NOT mapped to process.env. Use getCloudflareContext() to access them.
  // Falls back to process.env for local dev (where the cloudflare plugin is inactive).
  // Dynamic import: @cloudflare/vite-plugin may not be installed or may lack the
  // ./server export depending on version.
  try {
    const mod = "@cloudflare/vite-plugin/server";
    const { getCloudflareContext } = await import(/* @vite-ignore */ mod);
    const ctx = await getCloudflareContext();
    return ctx.env as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

/**
 * Returns the authenticated user from the current request.
 *
 * Verifies the Lovable identity token from the `x-lovable-identity-token`
 * header against the platform's JWKS endpoint. No shared secrets needed.
 *
 * Returns null for unauthenticated requests, including anonymous visits to
 * public apps that did not bootstrap project auth.
 *
 * Only call in server-side code: route loaders or createServerFn handlers.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const request = getRequest();
  if (!request) return null;

  const env = await getEnv();

  const identityToken = request.headers.get("x-lovable-identity-token");
  if (!identityToken) return null;

  const jwksUrl = env['__LOVABLE_JWKS_URL'];
  if (!jwksUrl) return null;

  return verifyIdentityToken(identityToken, jwksUrl, env['__LOVABLE_PROJECT_ID']);
}
