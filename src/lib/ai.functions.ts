import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function guard() {
  const { resolveViewer } = await import("./db.server");
  if (!(await resolveViewer())) throw new Error("Please sign in to use the cockpit.");
  return import("./ai.server");
}

export const draftReminder = createServerFn({ method: "POST" })
  .inputValidator((d: { customer: string; number: string | null; amount: string; dueDate: string | null; daysOverdue: number; tone: string; history: string }) =>
    z.object({ customer: z.string(), number: z.string().nullable(), amount: z.string(), dueDate: z.string().nullable(), daysOverdue: z.number(), tone: z.string(), history: z.string().max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiJson } = await guard();
    return aiJson<{ subject: string; body: string }>(
      "You write accounts-receivable reminder emails for a small B2B company. Be concise (under 140 words), polite, specific. Tone levels: friendly nudge, clear reminder, firm notice, final notice. Never invent bank details; say 'see the invoice for payment details'. Sign as 'Accounts Receivable'.",
      `Customer: ${data.customer}\nInvoice: ${data.number ?? "(no number)"}\nAmount outstanding: ${data.amount}\nDue date: ${data.dueDate}\nDays overdue: ${data.daysOverdue}\nTone: ${data.tone}\nPayment behaviour: ${data.history}`,
      { name: "email", schema: { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } } },
    );
  });

export type Extracted = {
  customerName: string | null; currency: string | null; invoiceDate: string | null; netTerms: number | null; description: string | null;
  lines: { description: string; quantity: number; unitPrice: number }[]; missing: string[];
};

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; customers: string[] }) => z.object({ text: z.string().min(3).max(20000), customers: z.array(z.string()).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { aiJson } = await guard();
    const nul = (t: string) => ({ type: ["string", "null"] as unknown as string, description: t });
    return aiJson<Extracted>(
      `Extract a sales invoice draft from the text. Pick customerName from this exact list when it clearly matches, else return the name as written: ${data.customers.join(" | ")}. Never guess amounts, quantities or rates: if missing, leave lines empty or omit them and list the field in "missing". Dates ISO YYYY-MM-DD. unitPrice is net, in major units. Today is ${new Date().toISOString().slice(0, 10)}.`,
      data.text,
      { name: "invoice", schema: { type: "object", additionalProperties: false, required: ["customerName", "currency", "invoiceDate", "netTerms", "description", "lines", "missing"], properties: {
        customerName: nul("customer"), currency: nul("ISO currency"), invoiceDate: nul("ISO date"), netTerms: { type: ["integer", "null"] }, description: nul("short description"),
        lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["description", "quantity", "unitPrice"], properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } } } },
        missing: { type: "array", items: { type: "string" } },
      } } },
    );
  });

export const askFinances = createServerFn({ method: "POST" })
  .inputValidator((d: { question: string; context: string; history: { role: "user" | "assistant"; text: string }[] }) =>
    z.object({ question: z.string().min(1).max(2000), context: z.string().max(60000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { aiText } = await guard();
    const input = [
      ...data.history.map((m) => ({ role: m.role, content: m.text })),
      { role: "user", content: data.question },
    ];
    return { answer: await aiText(
      `You are a finance analyst answering questions about the company's live Light ERP data. Use ONLY the data below; if the data can't answer, say what's missing. Show amounts in EUR (approximate conversion already applied) with short tables or bullets. Be concise.\n\nDATA (JSON):\n${data.context}`,
      input,
    ) };
  });

export const recommendActions = createServerFn({ method: "POST" })
  .inputValidator((d: { scenario: string; forecast: string; candidates: string }) => z.object({ scenario: z.string().max(2000), forecast: z.string().max(6000), candidates: z.string().max(10000) }).parse(d))
  .handler(async ({ data }) => {
    const { aiJson } = await guard();
    return aiJson<{ actions: { title: string; reason: string; invoiceId: string | null }[] }>(
      "You are a cash-management advisor. Given a stress scenario, its weekly forecast and open receivables, propose 3 concrete actions to avoid or shrink a cash dip (chase specific invoices, offer early-payment discounts, delay discretionary spend). Reference invoices by their id from the candidates when relevant. Vendor bills are not available, so don't propose delaying specific bills.",
      `Scenario: ${data.scenario}\nForecast: ${data.forecast}\nOpen receivables: ${data.candidates}`,
      { name: "actions", schema: { type: "object", additionalProperties: false, required: ["actions"], properties: { actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "reason", "invoiceId"], properties: { title: { type: "string" }, reason: { type: "string" }, invoiceId: { type: ["string", "null"] } } } } } } },
    );
  });

export const analyzeReceipt = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; country: string }) => z.object({ text: z.string().min(3).max(8000), country: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { aiJson } = await guard();
    return aiJson<{ vendor: string | null; date: string | null; amount: number | null; currency: string | null; category: string; deductible: boolean; reason: string }>(
      `Extract expense evidence from a receipt / booking email and judge whether it is likely business-deductible under ${data.country} rules. Categories: Travel – flights, Travel – hotel, Travel – ground, Meals & entertainment, Software, Office, Professional services, Other. Give a one-sentence reason. This is a suggestion, not tax advice. Never invent amounts: null if absent.`,
      data.text,
      { name: "receipt", schema: { type: "object", additionalProperties: false, required: ["vendor", "date", "amount", "currency", "category", "deductible", "reason"], properties: {
        vendor: { type: ["string", "null"] }, date: { type: ["string", "null"] }, amount: { type: ["number", "null"] }, currency: { type: ["string", "null"] },
        category: { type: "string" }, deductible: { type: "boolean" }, reason: { type: "string" },
      } } },
    );
  });
