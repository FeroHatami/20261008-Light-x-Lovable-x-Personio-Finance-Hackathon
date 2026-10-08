/* eslint-disable @typescript-eslint/no-explicit-any */
// Server-only Light API client. Never import from components.
export const LIGHT_BASE = "https://api.sandbox.light.inc/rest/ext/v1";

export function lightKey() {
  const key = process.env["LIGHT_API_KEY"];
  if (!key) throw new Error("LIGHT_API_KEY missing");
  return key;
}

export async function lightGet(path: string, params: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${LIGHT_BASE}/${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { Authorization: `Basic ${lightKey()}`, Accept: "application/json" },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

/** Pages through a list endpoint (limit/offset). */
export async function lightList(path: string, params: Record<string, string> = {}, max = 2000): Promise<any[]> {
  const out: any[] = [];
  const size = path.startsWith("bff/") ? 50 : 100; // the bff list caps page size at 50
  for (let offset = 0; offset < max; offset += size) {
    const { status, body } = await lightGet(path, { ...params, limit: String(size), offset: String(offset) });
    if (status !== 200) {
      console.error("Light API error", path, status, body);
      throw new Error(`Could not load ${path} from Light`);
    }
    if (Array.isArray(body)) return body;
    out.push(...(body.records ?? []));
    if (!body.hasMore) break;
  }
  return out;
}
