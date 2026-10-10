# Working on this repo with an AI coding agent

This file is the contract between a human/AI agent and this codebase. Read it
before making *any* change. [`docs/for-ai-agents.md`](docs/for-ai-agents.md) is
the long-form version.

## Non-negotiables

1. **Tenant isolation is law.** Every query on a tenant-owned table filters by
   `tenant_id`. Every server action calls `requireTenantId()` first. Every
   agent tool is created inside `buildAgentTools(tenantId, phone)`. A global
   `limit(1)` or a missing `tenant_id` condition is a data leak — treat it as
   a security bug, not a style issue.
2. **Fail closed.** Signature, dedup, or CAS uncertainty → no mutation, no
   reply. Never "log and continue" on authenticity doubts.
3. **Secrets stay server-side.** Write via `setCredential`; read via
   `getCredential`/`loadProviderCredentials`. Never return secrets to client
   components, never log values.
4. **Provider-agnostic core.** Business logic lives in `src/lib/engine/` and
   talks to `MessagingProvider`/`NormalizedInbound`. No provider SDK calls
   outside `src/lib/providers/` adapters.
5. **Idempotent effects.** Any externally-visible side effect (reply, owner
   notification, provider API call) must be claimed or deduplicated first.
6. **No project-specific assumptions.** This base serves any vertical — don't
   hardcode pizza/clinic/store logic; put it behind tenant config or tools.

## Harness you must have before editing

- `cp .env.example .env.local` with at minimum: `DATABASE_URL`,
  `AUTH_SECRET`, `ENCRYPTION_KEY`, `OPENAI_API_KEY` (or AI_* overrides).
- `npm run db:migrate && npm run db:seed` against a scratch database.
- Verification commands that must stay green:
  `npx tsc --noEmit` · `npx eslint src` · `npm run build`.
- If you add schema: `npm run db:generate` (needs a TTY — on Windows use
  `drizzle-kit generate --custom` and write the SQL yourself) → then migrate.

## Where things live

| You need to… | Look at |
|---|---|
| Add a messaging provider | `src/lib/providers/` + `docs/providers.md` |
| Touch inbound flow | `src/lib/engine/inbound-processor.ts` |
| Change agent behavior | `src/lib/agent/` (prompt, tools) |
| Change routing/session logic | `src/lib/whatsapp/session-*` |
| Add admin mutations | server actions + `requireTenantId` |
| Add schema | `src/db/schema.ts` + migration + tenant_id |
| Use the JEV decision harness | `src/lib/system-one/` + `harness/` + `docs/jev-harness.md` |

## JEV decision harness (opt-in)

This repo ships a provider-neutral **decision layer** (Jev / OpenAI Decisions)
with a pack catalog, thresholds, a measurement ledger and an SDD integration. It
is **opt-in and shadow-first**: nothing changes behavior until the ledger gate
promotes a pack.

- **Canonical doc:** [`docs/jev-harness.md`](docs/jev-harness.md); ledger +
  caveats: [`docs/jev-harness-ledger.md`](docs/jev-harness-ledger.md).
- **Source of truth:** `src/lib/system-one/` (`provider/`, `context/`, `packs/`,
  `policy.ts`, `ledger/`, `eval/`, `harness/`).
- **Agent surfaces:** `harness/skills/jev-decide/` (skill) and `harness/mcp/`
  (MCP tools). Onboarding: `harness/ONBOARDING.md` + `npm run onboard`.
- **Rules that carry over:** provider-agnostic core; secrets server-side only
  (never in `state`); fail-closed on `closed` packs; Engram is dev memory, never
  the product's tenant memory.
