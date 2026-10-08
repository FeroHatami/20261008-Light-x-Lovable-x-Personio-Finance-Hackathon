// Server-only Lovable AI Gateway helper (OpenAI Responses API, streamed, consumed server-side).
const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
const MODEL = "openai/gpt-6-astra";

export class AiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Schema = { name: string; schema: Record<string, unknown> };

/** Streams a Responses call and returns the final output text. */
export async function aiText(instructions: string, input: string | Record<string, unknown>[], schema?: Schema): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError(401, "AI is not configured for this project.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      ...(schema ? { text: { format: { type: "json_schema", name: schema.name, schema: schema.schema, strict: true } } } : {}),
    }),
  });
  void res.headers.get(LOVABLE_AIG_RUN_ID_HEADER);
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status}).`;
    try { const j = await res.json() as { message?: string; error?: { message?: string } }; msg = j.message ?? j.error?.message ?? msg; } catch { /* ignore */ }
    if (res.status === 402) msg = "Out of AI credits. Add credits in Settings → Plans & credits.";
    if (res.status === 429) msg = "AI is busy right now. Please try again in a minute.";
    throw new AiError(res.status, msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "", done = "";
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data) as { type?: string; delta?: string; text?: string; response?: { error?: { message?: string } } };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.output_text.done" && ev.text) done = ev.text;
        else if (ev.type === "response.failed" || ev.type === "error") throw new AiError(500, ev.response?.error?.message ?? "AI request failed.");
      } catch (e) { if (e instanceof AiError) throw e; }
    }
  }
  const text = done || out;
  if (!text.trim()) throw new AiError(422, "The AI returned no answer for this request.");
  return text;
}

export async function aiJson<T>(instructions: string, input: string, schema: Schema): Promise<T> {
  return JSON.parse(await aiText(instructions, input, schema)) as T;
}
