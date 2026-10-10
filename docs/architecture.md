# Architecture

WhatsApp Agent Base is a **multi-tenant, provider-agnostic engine** for WhatsApp
Business products. Every layer is replaceable: swap the WhatsApp provider, swap
the AI provider, swap the channel — the engine stays.

## Layer map

```
┌────────────────────────────────────────────────────────────┐
│  Admin (Next.js App Router)                                │
│  server actions → requireTenantId() → tenant-scoped Drizzle │
├────────────────────────────────────────────────────────────┤
│  Webhooks (thin shells)                                    │
│  /api/webhook/whatsapp  /api/meta/webhook  /api/chatwoot   │
│  rate-limit → raw body → parse → resolveChannel → verify   │
├────────────────────────────────────────────────────────────┤
│  Engine (provider-agnostic)        src/lib/engine/         │
│  inbound-processor: tenant → lead → conversation → dedup   │
│  → session policy (CAS) → route → buffer → agent → send    │
├────────────────────────────────────────────────────────────┤
│  Session policy                    src/lib/whatsapp/       │
│  session-policy (decisions) + session-store (CAS persist)  │
│  + human-handoff (idempotent effect claims)                │
│  + webhook-pipeline (eligibility, pure decisions)          │
├────────────────────────────────────────────────────────────┤
│  Providers                         src/lib/providers/      │
│  MessagingProvider: verifySignature · isNoise ·            │
│  parseInbound → NormalizedInbound · send(OutboundPayload)  │
│  registry: getProvider(name) + loadProviderCredentials()   │
├────────────────────────────────────────────────────────────┤
│  AI                                src/lib/agent/ + ai/    │
│  buildAgentTools(tenantId, phone) — every query scoped     │
│  ai/config.ts — per-tenant OpenAI-compatible provider      │
├────────────────────────────────────────────────────────────┤
│  Infra                             src/lib/                │
│  buffer/ (Redis + fallback)  queue/ (outbound + DLQ)       │
│  infra/circuit-breaker  idempotency  credentials (AES-256) │
│  channels/router (conversation + message persistence)      │
│  tenants.ts (resolution + per-tenant agent config)         │
├────────────────────────────────────────────────────────────┤
│  Data                              src/db/schema.ts        │
│  tenants · channels · credentials · users · conversations  │
│  chat_messages · session states/events/claims · leads ·    │
│  agent_config · products · orders · addresses · promotions │
└────────────────────────────────────────────────────────────┘
```

## The inbound contract

Every webhook route is a *thin shell*. It never contains business logic:

1. **Rate limit** by client IP (Upstash; falls open if Redis is down).
2. **Read raw body** — signature verification needs bytes, not parsed JSON.
3. **Parse JSON** — cheap; nothing derived from the payload is trusted yet.
4. **`provider.isNoise(payload)`** — echoes/status events return 200 immediately.
5. **`provider.parseInbound(payload)`** → `NormalizedInbound[]` — normalizes
   provider payloads into `{ provider, messageId, externalUserId,
   channelExternalId, kind, text, media, raw }`.
6. **`resolveChannel(provider, channelExternalId)`** → `{ tenantId, channelId }`
   — the business number / phone_number_id / inbox id in the payload maps to
   exactly one tenant through the `channels` table.
7. **`provider.verifySignature`** with **that tenant's** credentials.
   Unknown channel → env fallback (bootstrap path); bad signature → 401.
8. **`processInbound(inbound)`** for each message — the engine.

Parsing before verifying is deliberate: the secret needed to verify is chosen
*by* the payload's channel identity. Until verification passes, nothing is
persisted, sent, or trusted — the payload only selects which secret to use.

## The engine (processInbound)

`src/lib/engine/inbound-processor.ts`:

1. Resolve tenant (channel row → `getDefaultTenantId()` bootstrap fallback).
2. Upsert the lead (`tenantId` + phone).
3. `findOrCreateConversation` — keyed `(tenantId, whatsappId)`.
4. Dedup: unique index on `(tenant_id, platform_message_id)` — a retried
   webhook is a no-op, not a double reply.
5. Persist the inbound `chat_messages` row.
6. **Session policy transition** — CAS on `conversation_session_states`
   (`version` counter). Two racing deliveries of the same message cannot both
   pass. A CAS conflict fails closed: no reply beats a duplicate reply.
7. Route on the decision:
   - `fixed_ack` / `fixed_clarification` — canned reply, zero LLM calls.
   - `handoff` — idempotent effect claims (`conversation_session_effect_claims`
     unique on conversation+episode+effect+claimant) ensure the owner is
     notified once and the customer is told once, even under retries.
   - `blocked` / `duplicate` — silence.
   - `allow_agent` — debounce into the **buffer**; the flush runs the agent.
8. The agent's reply goes through `provider.send` with the resolved channel's
   credentials, then persists as an outbound `chat_messages` row.

## Why a session state machine

LLM agents are expensive and nondeterministic. The state machine answers
"does this message need the LLM at all?" before spending a token:

- First personal/casual message → one `fixed_ack`, episode marked.
- Ambiguous follow-up → one clarification, not a sales pitch.
- Human handoff requested → handoff effects claimed exactly once per episode.
- Human override active → `blocked`, the human owns the thread.
- Commercial conversation → `allow_agent`, and the agent receives the compact
  session facts (pending question, active order, cart) instead of the raw row.

## Credentials model

`src/lib/credentials.ts` — one table `(tenant_id, provider, key) → value_encrypted`.
Resolution order: DB row (AES-256 decrypted at the boundary) → env var fallback.
Env vars are the **bootstrap path** for single-tenant or first-run deployments;
in multi-tenant production secrets live in the DB. Nothing is ever logged —
`hasCredential` exists so admin UI can show "configured" without decryption.

## Failure policy

| Situation | Behavior |
|---|---|
| Bad/absent signature | 401, no mutation |
| Duplicate platform message id | 200, no reply |
| Session CAS conflict | Throw → logged → no reply (fail closed) |
| Redis down | In-memory buffer fallback (single instance only) |
| Provider send fails | Retried 3× (never on 4xx), then queue/DLQ |
| No tenant resolvable | `unresolved_tenant`, logged, no mutation |
