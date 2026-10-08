/**
 * JWKS-based identity token verification for Lovable apps.
 *
 * Uses only the Web Crypto API — runs in Cloudflare Workers, Deno, and Node.js.
 * Verifies RS256 JWTs against a JWKS endpoint, matching the same verification
 * path that will be used when the Lovable OAuth server (auth.lovable.dev) takes
 * over identity token issuance. When that happens, only the JWKS URL changes —
 * this code stays the same.
 */

export interface SessionUser {
  userId: string;
  displayName: string | null;
  email: string | null;
}

// Cache JWKS for 1 hour to avoid fetching on every request.
let cachedJwks: { keys: JWK[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

interface JWK {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JWTHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface IdentityClaims {
  sub: string;
  name?: string;
  email?: string;
  tenant_id?: string;
  project_id?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
}

function base64UrlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJWTHeader(token: string): JWTHeader | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;
  try {
    const headerJson = new TextDecoder().decode(base64UrlDecode(token.slice(0, dotIndex)));
    return JSON.parse(headerJson) as JWTHeader;
  } catch {
    return null;
  }
}

function decodeJWTPayload(token: string): IdentityClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1] ?? ""));
    return JSON.parse(payloadJson) as IdentityClaims;
  } catch {
    return null;
  }
}

async function importRSAPublicKey(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function fetchJwks(url: string): Promise<JWK[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }
  const data = (await response.json()) as { keys: JWK[] };
  cachedJwks = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function getCandidateKeys(keys: JWK[], kid?: string): JWK[] {
  if (!kid) return keys;
  return keys.filter((key) => key.kid === kid);
}

function expectedIssuerFromJwksUrl(jwksUrl: string): string {
  const url = new URL(jwksUrl);
  const jwksPathSuffix = "/.well-known/jwks.json";
  if (!url.pathname.endsWith(jwksPathSuffix)) {
    return url.origin;
  }

  const issuerPath = url.pathname.slice(0, -jwksPathSuffix.length);
  if (!issuerPath) {
    return url.origin;
  }

  url.pathname = issuerPath;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function verifySignatureWithJwk(token: string, jwk: JWK): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2] ?? "");

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importRSAPublicKey(jwk);
  } catch {
    console.warn("[lovable-auth] Failed to import JWKS public key");
    return false;
  }

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature.buffer as ArrayBuffer,
    signedContent.buffer as ArrayBuffer,
  );
}

/**
 * Verify an identity JWT against a JWKS endpoint.
 *
 * Returns the authenticated user if the token is valid, or null otherwise.
 * The returned SessionUser has the same shape as the legacy HMAC-based
 * getSessionUser(), so app code doesn't need to change.
 */
export async function verifyIdentityToken(
  token: string,
  jwksUrl: string,
  expectedProjectId?: string,
): Promise<SessionUser | null> {
  const header = decodeJWTHeader(token);
  if (!header || header.alg !== "RS256") return null;

  // Fetch JWKS and find the matching key
  let keys: JWK[];
  try {
    keys = await fetchJwks(jwksUrl);
  } catch {
    console.warn("[lovable-auth] Failed to fetch JWKS");
    return null;
  }

  const kid = header.kid;
  let candidateKeys = getCandidateKeys(keys, kid);

  // If key not found, try refreshing JWKS (handles key rotation)
  if (candidateKeys.length === 0 && kid) {
    cachedJwks = null;
    try {
      keys = await fetchJwks(jwksUrl);
    } catch {
      return null;
    }
    candidateKeys = getCandidateKeys(keys, kid);
  }
  if (candidateKeys.length === 0) return null;

  let valid = false;
  for (const candidateKey of candidateKeys) {
    if (await verifySignatureWithJwk(token, candidateKey)) {
      valid = true;
      break;
    }
  }
  if (!valid) return null;

  // Parse and validate claims
  const claims = decodeJWTPayload(token);
  if (!claims) return null;

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return null;
  if (!claims.sub) return null;

  // Validate not-before (60s clock skew allowance)
  if (claims.nbf && claims.nbf > now + 60) return null;

  // Validate issuer — derive the expected issuer from the JWKS URL so both the
  // legacy root-scoped issuer and the project-scoped OIDC issuer work.
  const expectedIssuer = expectedIssuerFromJwksUrl(jwksUrl);
  if (claims.iss !== expectedIssuer) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes("lovable-app")) return null;

  // Validate project scope when the expected project ID is known.
  // This prevents a token issued for project A from being accepted by project B.
  if (expectedProjectId && claims.project_id !== expectedProjectId) return null;

  return {
    userId: claims.sub,
    displayName: claims.name ?? null,
    email: claims.email ?? null,
  };
}
