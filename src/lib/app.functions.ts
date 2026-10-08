/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const ctx = async () => (await import("./db.server")).requireUser();
const log = async (db: any, action: string, detail: Record<string, unknown>) => (await import("./db.server")).audit(db, action, detail);

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveViewer } = await import("./db.server");
  const v = await resolveViewer();
  return v ? { name: v.user.name, email: v.user.email, demo: v.user.door === "demo" } : null;
});

// One-click demo sign-in: the demo password stays server-side; only session tokens are returned.
export const demoSignIn = createServerFn({ method: "POST" }).handler(async () => {
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: "demo@flowcockpit.app", password: process.env["DEMO_PASSWORD"]! });
  if (error || !data.session) throw new Error("Demo sign-in is unavailable right now.");
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
});

// ---------- generic lists ----------
const TABLES = ["approvals", "audit_log", "follow_ups", "scenarios", "stock", "orders", "expense_checks", "portal_links"] as const;
export const listRows = createServerFn({ method: "GET" })
  .inputValidator((d: { table: (typeof TABLES)[number] }) => z.object({ table: z.enum(TABLES) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const order = data.table === "stock" ? "product_name" : "created_at";
    const { data: rows, error } = await db.from(data.table).select("*").order(order, { ascending: data.table === "stock" }).limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

// ---------- settings ----------
export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { starting_cash: number; monthly_fixed_costs: number }) =>
    z.object({ starting_cash: z.number(), monthly_fixed_costs: z.number().min(0) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx();
    const { error } = await db.from("settings").upsert({ user_id: (user as any).userId, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await log(db, "settings.updated", data);
    return { ok: true };
  });

// ---------- approvals ----------
export const queueApproval = createServerFn({ method: "POST" })
  .inputValidator((d: { kind: string; title: string; summary?: string; payload: Record<string, unknown>; source?: string }) =>
    z.object({ kind: z.enum(["draft_invoice", "reminder_email", "draft_po", "recommendation"]), title: z.string().min(1).max(300), summary: z.string().max(4000).optional(), payload: z.record(z.any()), source: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { data: row, error } = await db.from("approvals").insert({ kind: data.kind, title: data.title, summary: data.summary ?? null, source: data.source ?? null, payload: data.payload as never }).select().single();
    if (error) throw new Error(error.message);
    await log(db, "approval.queued", { id: row.id, kind: data.kind, title: data.title });
    return row;
  });

async function lightPost(path: string, body: unknown, idem: string) {
  const { LIGHT_BASE, lightKey } = await import("./light.server");
  const res = await fetch(`${LIGHT_BASE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${lightKey()}`, "Content-Type": "application/json", Accept: "application/json", "X-Idempotency-Key": idem },
    body: JSON.stringify(body),
  });
  let json: any = null; try { json = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, json };
}

export const decideApproval = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; decision: "approve" | "reject"; payload?: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]), payload: z.record(z.any()).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { data: a, error } = await db.from("approvals").select("*").eq("id", data.id).single();
    if (error || !a) throw new Error("Approval not found");
    if (a.status !== "pending") throw new Error("This item was already decided.");
    const payload = (data.payload ?? a.payload) as any;
    const now = new Date().toISOString();
    if (data.decision === "reject") {
      await db.from("approvals").update({ status: "rejected", decided_at: now, payload }).eq("id", a.id);
      await log(db, "approval.rejected", { id: a.id, title: a.title });
      return { status: "rejected" };
    }
    let status = "approved"; let result: any = {};
    if (a.kind === "draft_invoice") {
      // Light requires a company entity and a product per line; reuse the customer's entity and override price/name.
      const { lightList } = await import("./light.server");
      const [invs, prods] = await Promise.all([lightList("invoice-receivables", { limit: "100" }), lightList("products")]);
      const entityId = payload.companyEntityId
        ?? invs.find((i: any) => i.customerId === payload.customerId)?.companyEntityId
        ?? invs[0]?.companyEntityId;
      const cur = payload.currency ?? "EUR";
      const fallbackProduct = prods.find((p: any) => (p.pricings ?? []).some((x: any) => x.currency === cur)) ?? prods[0];
      const lines = (payload.lines ?? []).map((l: any) => ({
        productId: l.productId ?? fallbackProduct?.id,
        quantity: Number(l.quantity || 1),
        priceOverwrite: Math.round(Number(l.unitPrice || 0) * 100),
        productNameOverwrite: String(l.description ?? "Item").slice(0, 200),
      }));
      const body = {
        companyEntityId: entityId, customerId: payload.customerId, currency: cur,
        invoiceDate: payload.invoiceDate ?? now.slice(0, 10), netTerms: Number(payload.netTerms ?? 30),
        description: String(payload.description ?? a.title).slice(0, 500), lines,
      };
      const r = await lightPost("invoice-receivables", body, `approval-${a.id}`);
      if (r.ok) { result = { ...result, lightId: r.json?.id, state: r.json?.state }; }
      else { status = "failed"; result = { error: r.json?.message ?? `Light returned ${r.status}` }; }
    } else if (a.kind === "draft_po") {
      const r = await lightPost("purchase-orders", {
        vendorId: payload.vendorId, purchaseOrderDate: now.slice(0, 10), currency: payload.currency ?? "EUR",
        lines: [{ description: payload.productName, quantity: Number(payload.quantity), netAmount: Math.round(Number(payload.quantity) * Number(payload.unitCost) * 100) }],
      }, `approval-${a.id}`);
      if (r.ok) result = { lightId: r.json?.id, state: r.json?.state };
      else { status = "failed"; result = { error: r.json?.message ?? `Light returned ${r.status}` }; }
    } else if (a.kind === "reminder_email") {
      result = { note: "Approved and logged. Not sent — sending to real customers is disabled." };
      await db.from("follow_ups").insert({
        invoice_id: payload.invoiceId, customer: payload.customer, note: `Reminder (${payload.tone}) approved`,
        next_touch: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
    } else {
      result = { note: "Recommendation accepted and logged. No Light write needed." };
    }
    await db.from("approvals").update({ status, decided_at: now, result, payload }).eq("id", a.id);
    await log(db, `approval.${status}`, { id: a.id, kind: a.kind, title: a.title, result });
    return { status, result };
  });

// ---------- follow-ups ----------
export const addFollowUp = createServerFn({ method: "POST" })
  .inputValidator((d: { invoice_id: string; customer: string; note: string; promised_date?: string | null; next_touch?: string | null }) =>
    z.object({ invoice_id: z.string(), customer: z.string(), note: z.string().max(1000), promised_date: z.string().nullable().optional(), next_touch: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { error } = await db.from("follow_ups").insert({ invoice_id: data.invoice_id, customer: data.customer, note: data.note, promised_date: data.promised_date ?? null, next_touch: data.next_touch ?? null });
    if (error) throw new Error(error.message);
    await log(db, "followup.logged", data);
    return { ok: true };
  });

// ---------- scenarios ----------
export const saveScenario = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; params: Record<string, number> }) => z.object({ name: z.string().min(1).max(80), params: z.record(z.number()) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { error } = await db.from("scenarios").insert({ name: data.name, params: data.params as never });
    if (error) throw new Error(error.message);
    await log(db, "scenario.saved", { name: data.name });
    return { ok: true };
  });
export const deleteRow = createServerFn({ method: "POST" })
  .inputValidator((d: { table: "scenarios" | "stock" | "orders" | "expense_checks" | "portal_links"; id: string }) =>
    z.object({ table: z.enum(["scenarios", "stock", "orders", "expense_checks", "portal_links"]), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    await db.from(data.table).delete().eq("id", data.id);
    await log(db, `${data.table}.deleted`, { id: data.id });
    return { ok: true };
  });

// ---------- inventory ----------
export const upsertStock = createServerFn({ method: "POST" })
  .inputValidator((d: { product_id: string; product_name: string; quantity: number; safety_level: number; vendor_id?: string | null; unit_cost: number }) =>
    z.object({ product_id: z.string(), product_name: z.string(), quantity: z.number(), safety_level: z.number().min(0), vendor_id: z.string().nullable().optional(), unit_cost: z.number().min(0) }).parse(d))
  .handler(async ({ data }) => {
    const { db, user } = await ctx();
    const { error } = await db.from("stock").upsert({ ...data, vendor_id: data.vendor_id ?? null, user_id: (user as any).userId }, { onConflict: "user_id,product_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { customer_id: string; customer_name: string; product_id: string; product_name: string; quantity: number; unit_price: number; currency: string }) =>
    z.object({ customer_id: z.string(), customer_name: z.string(), product_id: z.string(), product_name: z.string(), quantity: z.number().positive(), unit_price: z.number().min(0), currency: z.string().length(3) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { error } = await db.from("orders").insert(data);
    if (error) throw new Error(error.message);
    await log(db, "order.created", data);
    return { ok: true };
  });
export const fulfillOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { data: o } = await db.from("orders").select("*").eq("id", data.id).single();
    if (!o || o.status !== "open") throw new Error("Order not open");
    await db.from("orders").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", o.id);
    const { data: s } = await db.from("stock").select("*").eq("product_id", o.product_id).maybeSingle();
    if (s) await db.from("stock").update({ quantity: Number(s.quantity) - Number(o.quantity) }).eq("id", s.id);
    const { data: ap } = await db.from("approvals").insert({
      kind: "draft_invoice", source: "order", title: `Invoice ${o.customer_name} — ${o.quantity} × ${o.product_name}`,
      summary: "Generated from fulfilled order.",
      payload: { customerId: o.customer_id, customer: o.customer_name, currency: o.currency, netTerms: 30, description: `Order ${o.id.slice(0, 8)}`,
        lines: [{ productId: o.product_id, description: o.product_name, quantity: Number(o.quantity), unitPrice: Number(o.unit_price) }] } as never,
    }).select().single();
    await log(db, "order.fulfilled", { id: o.id, approvalId: ap?.id });
    return { ok: true };
  });

// ---------- portal ----------
export const createPortalLink = createServerFn({ method: "POST" })
  .inputValidator((d: { invoice_id: string; customer: string; amount: number; currency: string; due_date: string | null; discount_pct: number; installments: number }) =>
    z.object({ invoice_id: z.string(), customer: z.string(), amount: z.number(), currency: z.string(), due_date: z.string().nullable(), discount_pct: z.number().min(0).max(5), installments: z.number().int().min(0).max(12) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { data: row, error } = await db.from("portal_links").insert(data).select().single();
    if (error) throw new Error(error.message);
    await log(db, "portal.link_created", { invoice_id: data.invoice_id });
    return row;
  });

function publicDb() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    } },
  });
}

export const getPortal = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().regex(/^[a-f0-9]{36}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await publicDb().rpc("get_portal", { _token: data.token });
    if (error) throw new Error("Could not load this link.");
    return (rows as any[])?.[0] ?? null;
  });

export const respondPortal = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; response: "discount" | "plan" | "dispute"; note: string }) =>
    z.object({ token: z.string().regex(/^[a-f0-9]{36}$/), response: z.enum(["discount", "plan", "dispute"]), note: z.string().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await publicDb().rpc("respond_portal", { _token: data.token, _response: data.response, _note: data.note });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- expense checks ----------
export const saveExpenseCheck = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => z.object({
    source_text: z.string().max(5000), vendor: z.string().nullable(), expense_date: z.string().nullable(), amount: z.number().nullable(),
    currency: z.string().nullable(), category: z.string().nullable(), deductible: z.boolean().nullable(), deductible_reason: z.string().nullable(),
    matched_expense_id: z.string().nullable(), match_status: z.string(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const { error } = await db.from("expense_checks").insert(data);
    if (error) throw new Error(error.message);
    await log(db, "expense.checked", { vendor: data.vendor, amount: data.amount, match: data.match_status });
    return { ok: true };
  });
