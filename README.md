# Flow Cockpit — Finance process intelligence on Light

Flow Cockpit is an AI-powered layer on top of the [Light](https://light.inc) ERP. It shows how cash moves through your business, helps collect overdue invoices, stress-tests cash, and drafts invoices from any document. **A person approves every write before it reaches Light.**

## Features

| Page | What it does |
| --- | --- |
| **Overview** | Live process map (order-to-cash, procure-to-pay, expenses), cash KPIs, 13-week outlook and risk alerts. Steps with no real data are hidden. |
| **Collections** | Overdue invoices ranked by priority, AI-written reminder drafts (never emailed), and a shareable customer portal link. |
| **What-if** | Sliders and one-click presets (late top customers, revenue drop, new hires). Baseline vs scenario chart, plus AI recommendations linked to Collections. |
| **Forecast** | 13-week cash forecast from real Light invoices and bills, with an editable starting cash assumption (default €150,000). |
| **Invoice from anything** | Paste text or upload a PDF; AI extracts a draft invoice and sends it to the approval queue. |
| **Ask your finances** | Plain-English questions answered from live Light data, with tables and bars. |
| **Approvals (top bar)** | Pending-count badge that opens the queue in a drawer. Approving creates **drafts only** in Light. |
| **Customer portal** | Tokenized public page where a customer can accept an early-payment discount, pick installments or raise a dispute. No account needed. |

## Safety model

- The Light API key lives only on the server. The browser never sees it.
- No direct writes: every action goes through the Approval Queue, and approved invoices are created as **drafts**.
- No destructive actions (open, archive, reset) are exposed, and no emails go to customers.
- Database tables use row-level security. The public portal uses token-checked database functions.
- One-click demo login for judges. The demo password stays server-side and public signup is disabled.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19, Vite 7, server functions), Tailwind CSS v4, Recharts
- Lovable Cloud (Postgres, auth, row-level security)
- Lovable AI Gateway (Gemini models) for extraction, drafting, recommendations and Q&A
- Light REST API (sandbox): `https://api.sandbox.light.inc/rest/ext/v1`

## Project structure

```text
src/
  routes/            Pages (index = Overview, collections, what-if, forecast, new-invoice, ask, portal.$token, ...)
  components/        AppShell (sidebar, approvals drawer), ProcessMap, ApprovalQueue, UI kit
  lib/
    light.server.ts  Server-only Light API client
    snapshot.functions.ts  Loads and normalizes Light data
    analytics.ts / process.ts  Forecast, payment velocity, process map model
    ai.server.ts / ai.functions.ts  AI calls
    app.functions.ts  Approvals, demo sign-in, portal, settings
    db.server.ts     Viewer resolution and per-user database client
supabase/migrations/ Database schema and security policies
```

## Run locally

Requirements: Node 20+ (or Bun 1.1+).

```sh
cp .env.example .env    # then fill in the secrets below
npm install
npm run dev             # http://localhost:8080
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Backend connection (public values) |
| `LIGHT_API_KEY` | Light API key, from https://app.light.inc/settings/api-keys |
| `LOVABLE_API_KEY` | AI Gateway key for the AI features |
| `DEMO_PASSWORD` | Password of the demo account used by "Continue as demo user" |

Never commit `.env`. Production build: `npm run build`.

## Known limitations

- Sandbox ledger has no opening balance, so starting cash is an editable assumption.
- Payment-speed estimates are rough because the sandbox has few paid invoices.
- Light's vendor-bill list returns about 100 of 104 records due to paging limits.

## License

MIT. See [LICENSE](LICENSE).
