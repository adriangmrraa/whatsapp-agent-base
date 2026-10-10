# Guide for AI coding agents

This repository is a **multi-tenant, provider-agnostic base** for WhatsApp
Business SaaS products. If you are an AI agent asked to build a product on top
of it — or to modify the base itself — follow this guide exactly.

## Step 0 — Understand before touching

Read in this order:

1. `README.md` — what the project is.
2. `docs/architecture.md` — the layers and the inbound pipeline.
3. `docs/multi-tenancy.md` — the isolation rules (security boundary).
4. `AGENTS.md` — non-negotiables.
5. `src/db/schema.ts` — the data model.
6. `src/lib/engine/inbound-processor.ts` — the heart of the message flow.
7. `src/lib/providers/types.ts` — the provider contract.

Do not guess. If anything below is unclear or missing, **ask the human for
context before writing code.**

## Step 1 — Ask for the context you need

Before implementing, confirm:

- **Which provider(s)** will this deployment use? (ycloud / meta / chatwoot)
- **Which AI provider/model** per tenant? (env fallback or `agent_config.ai_*`)
- **Is this a fresh DB or an upgrade** of a live single-tenant deployment?
  (affects how you handle `drizzle/0001` and data backfill)
- **What vertical** is being built? (drives which agent tools you'll add)
- **Local or CI environment?** (Windows has no TTY — see drizzle caveat below)

## Step 2 — Build the harness

You need a runnable loop before changing code:

```bash
cp .env.example .env.local
# fill: DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, OPENAI_API_KEY
npm run db:migrate      # fresh DB → creates all tables incl. tenants
npm run db:seed         # default tenant + admin + catalog
npm run dev
```

Verification loop (must stay green — run before and after your change):

```bash
npx tsc --noEmit
npx eslint src
npm run build
```

Optional harness for webhook testing without real provider calls: a local
`tsc`-checked script that calls `processInbound()` with a fabricated
`NormalizedInbound` against a seeded test tenant — it exercises the full
tenant → conversation → session → routing path without network access.

## Step 3 — Invariants you must not break

These are security boundaries, not preferences:

1. **Every tenant-owned query filters by `tenant_id`.** New table → add
   `tenantId` + FK + tenant-scoped indexes/uniques. New query → `eq(..., tenantId)`.
2. **Server actions start with `requireTenantId()`.** Webhooks resolve tenant
   via `resolveChannel(provider, externalId)` — never `getDefaultTenantId()`
   as the primary path in production code.
3. **Signature before mutation.** In webhook routes, nothing persists or sends
   until `provider.verifySignature` passes — parsing early is only allowed to
   *select the tenant's secret*.
4. **Dedup + CAS + effect claims stay intact.** Retried deliveries must be
   free. If you add a side effect (send, notify, write), claim it first.
5. **Agent tools are per-tenant factories.** Tools go inside
   `buildAgentTools(tenantId, phone)`; there is no global tool registry.
6. **Secrets:** `setCredential`/`getCredential` only. Never a plaintext
   column, never a client prop, never a log value.
7. **Provider code stays in `src/lib/providers/`.** The engine and admin must
   never import provider SDKs directly.

## Step 4 — When changing the schema

- `src/db/schema.ts` is the source of truth.
- `npm run db:generate` requires an **interactive TTY** (it may ask "created or
  renamed?"). On Windows/non-TTY: run `npx drizzle-kit generate --custom` and
  hand-write the SQL — follow `drizzle/0001_marvelous_randall.sql` as the
  style guide (statement-breakpoint separators, backfill-first pattern:
  nullable column → UPDATE → SET NOT NULL).
- New columns on tenant-owned tables must be backfilled — never `SET NOT NULL`
  without a preceding UPDATE.

## Step 5 — Adding a provider

Full checklist in `docs/providers.md`. Short version: enum value → adapter
file implementing `MessagingProvider` → register + credential keys in
`registry.ts` → thin webhook route (copy `api/webhook/whatsapp/route.ts`).

## Step 6 — Adding agent tools

Add inside `buildAgentTools` in `src/lib/agent/tools.ts`. Rules: tenant-scoped
`where` clauses, zod-described parameters, return compact JSON-friendly
results (the result goes into the model's context — keep it small).

## Common pitfalls seen in the wild

- `limit(1)` without tenant filter → cross-tenant leak.
- Reading `agentConfig` with `id = 1` → there is no singleton anymore.
- Verifying webhooks with a *global* secret → wrong; resolve the channel's
  tenant first, then verify with that tenant's secret.
- Storing a provider token in `agent_config` plaintext → use `credentials`.
- Forgetting `platformMessageId` on inbound rows → dedup breaks.
- `processInbound` returning without an `InboundOutcome` → callers misbehave.
