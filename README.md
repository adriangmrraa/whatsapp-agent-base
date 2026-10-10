# WhatsApp Agent Base

**A multi-tenant, provider-agnostic foundation for building WhatsApp Business SaaS products.**

This is not an application — it is a production-grade base you build *on top of*. It ships the hard parts already solved: tenant isolation, encrypted per-tenant credentials, provider adapters (YCloud, Meta Cloud API, Chatwoot), a durable AI session state machine, webhook signature verification, idempotency, rate limiting, buffering, and an admin panel — so your product is your schema extensions and your tools, not plumbing.

**Repository:** `github.com/adriangmrraa/whatsapp-agent-base`
The code lives locally *and* on GitHub — clone it, fork it, or use it as a template.

---

## What you get

| Capability | How it works |
|---|---|
| **Multi-tenant core** | `tenant_id` on every business row; resolution via `channels` (provider + external id) for inbound, session `tenantId` for admin |
| **Provider-agnostic messaging** | `MessagingProvider` interface → adapters for **YCloud**, **Meta Cloud API**, **Chatwoot**; add yours in ~150 lines |
| **Provider-agnostic AI** | Any OpenAI-compatible endpoint per tenant (OpenAI, OpenRouter, DeepSeek, Groq, Together, Ollama) |
| **Vector memory** | Tenant-scoped semantic knowledge store on **pgvector** — ingest chunk+embed docs, retrieve top-k before `generateText`. Swappable embedding provider (default OpenAI `text-embedding-3-small`) |
| **Agent platform seams** | A provider-neutral capability registry (surface + role gating, Realtime/Chat projections), a deterministic **System One** decision layer (Jev rules today, Laya swappable), and internal **voice-agent** (OpenAI Realtime) interfaces — one engine, two agents |
| **Jev decision harness** | A reusable, provider-neutral decision layer — **Jev** (System One) with **OpenAI's Decisions API** as a second provider — plus a memory-augmented context primer (**Engram** local / cloud / Neon), SDD decision packs, a shadow/A-B ledger, and one-command onboarding → [`docs/jev-harness.md`](docs/jev-harness.md) |
| **Durable session engine** | Per-conversation state machine (commercial / personal_acknowledged / handed_off) with compare-and-swap + idempotent side effects — survives restarts, suppresses duplicate webhooks, avoids unnecessary LLM calls |
| **Human handoff** | Agent or human can claim a conversation; `human_override` window silences the AI; Chatwoot inbox bridging included |
| **Security** | AES-256 encrypted credentials, per-tenant webhook signature verification, fail-closed dedup/CAS, rate limiting, secret redaction in logs |
| **Admin panel** | Conversations inbox, orders, products, leads, promotions, analytics, agent config — all tenant-scoped |
| **Resilience** | Redis message buffer (+in-memory fallback), outbound queue with DLQ, circuit breakers, cron flush endpoint |

## Stack

Next.js 16 (App Router) · TypeScript 5 · PostgreSQL + Drizzle ORM · NextAuth v5 · Vercel AI SDK · Upstash Redis (optional) · Tailwind 4 + Radix UI.

## Quick start

```bash
git clone https://github.com/adriangmrraa/whatsapp-agent-base.git
cd whatsapp-agent-base
npm install

cp .env.example .env.local   # fill DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, AI creds
npm run db:migrate           # or `npm run db:push` for a fresh dev DB
npm run db:seed              # creates default tenant + admin + sample catalog
npm run dev
```

Login at `http://localhost:3000/login` — `admin@example.com` / `ADMIN_PASSWORD` (default `admin123`).

## How a message flows

```
webhook (ycloud | meta | chatwoot)
  → rate limit → parse → resolveChannel(provider, externalId) → tenant
  → verify signature with that tenant's secret        [fail closed]
  → dedup by platform message id (unique index)        [fail closed]
  → session policy CAS transition                      [fail closed]
  → route: fixed_ack | clarification | handoff | allow_agent | blocked
  → allow_agent → Redis buffer (debounce) → AI agent (tenant-scoped tools)
  → provider.send → persist outbound → audit event
```

## Documentation

| Doc | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Layers, data flow, design rationale |
| [`docs/multi-tenancy.md`](docs/multi-tenancy.md) | Tenant model, resolution, isolation rules |
| [`docs/providers.md`](docs/providers.md) | YCloud / Meta / Chatwoot setup + how to add a provider |
| [`docs/ai-engine.md`](docs/ai-engine.md) | Agent tools, session policy, buffer, queue |
| [`docs/embeddings.md`](docs/embeddings.md) | Vector memory: pgvector store, ingest, retrieval, agent wiring |
| [`docs/agent-platform.md`](docs/agent-platform.md) | One engine, two agents: capabilities, System One (Jev), voice, storefront |
| [`docs/channels-meta.md`](docs/channels-meta.md) | Instagram + Facebook (Meta Graph API) — design + adapter checklist |
| [`docs/security.md`](docs/security.md) | Threat model, credentials, fail-closed rules |
| [`docs/deployment.md`](docs/deployment.md) | Production checklist, cron, env reference |
| [`docs/jev-harness.md`](docs/jev-harness.md) | **Jev decision harness** — provider-neutral decision layer (Jev + OpenAI Decisions), memory backends, SDD packs, one-command onboarding |
| [`docs/jev-harness-ledger.md`](docs/jev-harness-ledger.md) | Jev ledger — how decisions are measured, and the honest caveats |
| [`docs/for-ai-agents.md`](docs/for-ai-agents.md) | **Guide for AI coding agents** — how to explore, what context to ask for, harness requirements |
| [`docs/presentations/`](docs/presentations/) | Self-contained HTML decks — open in a browser, no server needed |
| [`AGENTS.md`](AGENTS.md) | Rules any AI/human agent must follow in this repo |

## Marketing assets

Code-generated visuals for promoting the base — no design tools, no Formosa.dev brand assets. Everything lives in [`marketing/`](marketing/):

| Asset | What it is | Regenerate |
|---|---|---|
| [`marketing/carousel/`](marketing/carousel/) | 7-slide Instagram carousel (1080×1350), warm editorial style; PNGs in `carousel/png/` | `cd marketing && npm i && npm run export:carousel` |
| [`marketing/video/story-whatsapp-agent-base/`](marketing/video/story-whatsapp-agent-base/) | HyperFrames story (1080×1920, 20s), WhatsApp-green accent; MP4 in `renders/` | `cd marketing/video/story-whatsapp-agent-base && npm run render` |

See [`marketing/README.md`](marketing/README.md) for details.

## Build your product on top

The base is intentionally generic. To ship a vertical product (pizzeria, clinic, store):

1. Extend `src/db/schema.ts` with your domain tables — **always include `tenantId`**.
2. Add agent tools in `src/lib/agent/tools.ts` via `buildAgentTools(tenantId, phone)`.
3. Tune the system prompt per tenant in `agent_config` (admin UI or seed).
4. Connect channels: YCloud env vars, Meta OAuth button in admin, or Chatwoot config.
5. Keep every query tenant-scoped — see [`AGENTS.md`](AGENTS.md) for the isolation rules.

See [`docs/for-ai-agents.md`](docs/for-ai-agents.md) if you're driving this repo with a coding agent.

## Jev decision harness

A reusable, **provider-neutral decision layer** ships in this repo: code owns the
workflow, **Jev** (or **OpenAI Decisions**) owns the bounded semantic decision, the
LLM owns generation, and **Engram** gives every decision memory and an audit trail.
It plugs into the local SDD coding-agent flow and is usable by students and the
community with a single `JEV_API_KEY`.

- **Provider-neutral** — a single `DecisionProvider` interface; switch Jev ↔ OpenAI
  Decisions with an env var. See `src/lib/system-one/provider/`.
- **Memory-augmented** — a `ContextPrimer` retrieves prior context/decisions from
  **Engram** before every call and writes the decision back. Three memory backends,
  env-switchable with no code change: `local` (local Engram), `cloud` (remote
  Engram), `neon` (memories in this app's Postgres; `tenant_id` is **nullable** so
  the harness runs with no tenant). See `src/lib/system-one/context/memory/`.
- **Decision packs** — 14 SDD-oriented recipes (file-scope, workload-forecast,
  guard, triage, test-impact, …). See `src/lib/system-one/packs/`.
- **Policy + eval + ledger** — centralized thresholds and fail-posture, golden-fixture
  evals, and a shadow → A/B → gate measurement ledger (`policy.ts`, `eval/`, `ledger/`).
- **SDD integration kit** — `harness/sdd/` (in-repo docs + helpers; it does not edit
  the agent's global skills).
- **Agent packaging** — `harness/skills/jev-decide` (Agent Skill) + `harness/mcp/`
  (stdio MCP server) + `harness/install.sh`. See [`harness/ONBOARDING.md`](harness/ONBOARDING.md).

One-command onboarding (env + DB + optional Jev/OpenAI, YCloud, Meta Embedded
Signup, catalog, harness install — idempotent and fail-soft):

```bash
npm run onboard                 # interactive; asks what to enable
npm run onboard -- --jev --yes  # non-interactive: env + db + decision smoke-test + skill install
npm run onboard -- --dry-run    # print the plan, change nothing
```

Set `JEV_API_KEY` (alias `TYPESAFE_API_KEY`) to enable Jev; choose the memory
backend with `JEV_MEMORY=local|cloud|neon`.

**Read [`docs/jev-harness.md`](docs/jev-harness.md)** — the canonical doc: the
provider-neutral contract, the memory backends, the 14-pack catalog (when to use each
+ which Jev question type), the SDD integration, and the adoption methodology
(shadow → measure → A/B → gate → calibrate). The measurement approach and the
**honest caveats** (what Jev does and does *not* do) live in
[`docs/jev-harness-ledger.md`](docs/jev-harness-ledger.md).

## Agent onboarding (AI-first)

If you are an AI coding agent handed this repository, this is your runbook — the
human only needs to provide the API key. Goal: wire the JEV decision harness so you
can call the decision packs while coding, **without changing app behavior**
(shadow-first, opt-in).

**Read first:** [`docs/jev-harness.md`](docs/jev-harness.md) ·
[`harness/ONBOARDING.md`](harness/ONBOARDING.md) · [`AGENTS.md`](AGENTS.md).

1. **Key (human).** Ask the human to put `JEV_API_KEY=ts_...` in `.env.local`
   (alias `TYPESAFE_API_KEY`; or `OPENAI_API_KEY` + `DECISION_ENGINE=openai-decisions`).
   Secrets are **env-only** — never in JSON, never committed, never printed.
2. **Plan first.** `npm run onboard -- --dry-run` (changes nothing).
3. **Onboard.** `npm run onboard -- --jev --yes` — bootstraps `.env.local`, the DB
   (migrate + seed), runs the decision **smoke test** (proves the key), and installs
   the `jev-decide` skill.
4. **Register the MCP server** (so you can call the 14 packs) — add the
   `jev-harness` entry to `opencode.json`; see [`harness/mcp/README.md`](harness/mcp/README.md).
5. **Verify.**
   ```bash
   node --test harness/mcp/mcp.test.mjs
   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node harness/mcp/server.mjs   # 14 tools
   npx tsc --noEmit && npx eslint src && npm test && npm run build   # app gate
   ```
6. **Use.** Call the packs for bounded decisions (`jev_file_scope`, `jev_guard`,
   `jev_workload_forecast`, …) — see `harness/skills/jev-decide/SKILL.md` for when to
   call each; persist decisions to Engram. Stay in **shadow** until the ledger proves
   value.
7. **Measure.** `npm run jev:report`; A/B baseline vs +Jev. Adoption gate: cost ↓ ≥30%,
   quality ≥0.95×, p95 ≤1.2×.

### Harness configuration (env — all optional; no key ⇒ `rules`, offline)

| Env | Values |
|---|---|
| `JEV_API_KEY` / `TYPESAFE_API_KEY` | Jev key |
| `DECISION_ENGINE` / `DECISION_PROVIDER` | `jev` · `openai-decisions` · `rules` |
| `JEV_BASE_URL` · `DECISION_MODEL` | endpoint · model (`jev-latest`) |
| `JEV_MEMORY` | `local` · `cloud` · `neon` |
| `JEV_MEMORY_PROJECT` · `ENGRAM_HTTP_URL` · `ENGRAM_CLOUD_URL` · `ENGRAM_CLOUD_TOKEN` | memory backend |

### Rollback — return to the current state (nothing breaks)

The harness is **opt-in and additive**; testing never edits `main`'s tracked code
(`main` stays at the last merge). To fully revert:

```bash
# 1. disable the decision engine — offline, explicit no-answers
#    in .env.local: set DECISION_ENGINE=rules  (or remove JEV_API_KEY)
# 2. remove local test artifacts (all untracked)
rm -f harness/config.json                     # if created
rm -rf .opencode/skills/jev-decide            # the installed skill
# 3. remove the jev-harness MCP entry from opencode.json
# 4. confirm the repo is unchanged
git status && git log --oneline -1            # expect: your own WIP only; HEAD unchanged
```

With `DECISION_ENGINE=rules` (or no key) the provider degrades to `rules` and the
agent simply doesn't receive Jev answers — **no behavior change, no breakage**. The
WhatsApp product's own runtime is separate and unaffected.

## Roadmap

One engine (tools + data + tenant + deterministic decisions + vector memory)
feeding two agents — a customer agent on connected channels and an internal
staff agent. Planned items are in parentheses; shipped items are not.

- Tenant-scoped vector memory on pgvector (embedding provider + store abstraction, ingest, retrieval, agent wiring)
- Agent-platform seams — capability registry, System One decision layer (Jev rules / Laya swappable), internal voice-agent (OpenAI Realtime) interfaces
- Deploy docs for local / VPS / Render with Neon as the default database
- Hosted Jev/Laya decision provider behind `DecisionLayer` — per-tenant config, batched `decideSet`, timeout + circuit breaker, rules fallback
- Internal voice agent runtime — Realtime session, audio, tool-call bridge
- Storefront + pre-agent order capture: admin-loaded catalog → public landing + digital menu → structured checkout → agent confirms the structured order
- Instagram + Facebook channels via Meta Graph API
- Jev decision harness — provider-neutral providers (Jev + OpenAI Decisions), memory backends (local / cloud / Neon, tenant-optional), 14 SDD decision packs, shadow/A-B ledger, one-command onboarding (see [`docs/jev-harness.md`](docs/jev-harness.md))

## Verification

```bash
npx tsc --noEmit    # typecheck
npx eslint src      # lint
npm test            # unit tests (node:test via tsx)
npm run build       # production build
```

## License

MIT
