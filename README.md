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
| [`docs/security.md`](docs/security.md) | Threat model, credentials, fail-closed rules |
| [`docs/deployment.md`](docs/deployment.md) | Production checklist, cron, env reference |
| [`docs/for-ai-agents.md`](docs/for-ai-agents.md) | **Guide for AI coding agents** — how to explore, what context to ask for, harness requirements |
| [`docs/presentations/`](docs/presentations/) | Self-contained HTML decks — open in a browser, no server needed |
| [`AGENTS.md`](AGENTS.md) | Rules any AI/human agent must follow in this repo |

## Build your product on top

The base is intentionally generic. To ship a vertical product (pizzeria, clinic, store):

1. Extend `src/db/schema.ts` with your domain tables — **always include `tenantId`**.
2. Add agent tools in `src/lib/agent/tools.ts` via `buildAgentTools(tenantId, phone)`.
3. Tune the system prompt per tenant in `agent_config` (admin UI or seed).
4. Connect channels: YCloud env vars, Meta OAuth button in admin, or Chatwoot config.
5. Keep every query tenant-scoped — see [`AGENTS.md`](AGENTS.md) for the isolation rules.

See [`docs/for-ai-agents.md`](docs/for-ai-agents.md) if you're driving this repo with a coding agent.

## Verification

```bash
npx tsc --noEmit    # typecheck
npx eslint src      # lint
npm run build       # production build
```

## License

MIT
