import { createServerFn } from "@tanstack/react-start";

import type { SessionUser } from "./identity-jwt";

export type { SessionUser };

/**
 * Get the current session user. Safe to call from client routes — runs on
 * the server via RPC, so .server.ts imports stay out of the client bundle.
 *
 * Returns the authenticated user (SSO identity), or null for unauthenticated
 * requests that did not bootstrap project auth.
 *
 * Usage in a route:
 *   const user = await $getSessionUser()
 *
 * Usage in a loader:
 *   loader: () => $getSessionUser()
 */
export const $getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("./auth.server");
  return getSessionUser();
});

/**
 * Returns the raw identity JWT for use as a Supabase access token (TPA).
 *
 * With Third-Party Auth, the Lovable identity JWT is passed directly to
 * the Supabase client via the `accessToken` callback. No token exchange
 * is needed — Supabase verifies the JWT against the Lovable JWKS endpoint.
 */
export const $getIdentityToken = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  return request?.headers.get("x-lovable-identity-token") ?? null;
});
