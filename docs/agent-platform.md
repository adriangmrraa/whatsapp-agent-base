# Agent platform — one engine, two agents

`whatsapp-agent-base` is evolving from "a WhatsApp bot base" into the
**operational brain of any business**: one engine (tools + data + tenant +
deterministic decision layer + vector memory) feeding **two agents**:

- **(A) Customer agent** — sales/support on connected channels (WhatsApp, and
  later Instagram + Facebook).
- **(B) Internal staff agent** — role-gated, voice-enabled (OpenAI Realtime).

Both reuse the **same capabilities, the same data, and the same vector store**.
This document describes the seams laid down for that, and the reference
architectures they imitate.

## Shared layers

```
                  ┌─────────────────────────────┐
 customer agent → │  capabilities registry      │ ← internal voice agent
 (WhatsApp/IG/FB) │  (surface + role gating)    │   (OpenAI Realtime)
                  └──────────────┬──────────────┘
                                 │ executeCapability(ctx, name, args)
                  ┌──────────────▼──────────────┐
                  │  data (Drizzle, tenant_id)  │
                  │  vector store (embeddings)  │
                  │  System One (Jev)           │
                  └─────────────────────────────┘
```

### Capability registry — implemented

`src/lib/capabilities/`:

- `types.ts` — `CapabilityDescriptor` (name, description, JSON-schema
  `parameters`, allowed `surfaces`, allowed `roles`, tenant-scoped `execute`).
- `registry.ts` — `selectCapabilities(ctx)` (surface + role gating),
  `executeCapability(ctx, name, args)`, and projections `toRealtimeTools()` /
  `toChatTools()`.

The customer agent's AI-SDK toolset (`src/lib/agent/tools.ts`) remains the
shipped customer projection and delegates to the same helpers (e.g.
`searchKnowledge → retrieveKnowledge`). New domain tools and the internal agent
should be described **once** in the registry and projected per transport.

### System One — deterministic decisions (Jev / Laya) — implemented (rules core)

`src/lib/system-one/`:

```ts
interface DecisionLayer {
  name: string;                                  // "jev" | "laya" | "hosted:{engine}"
  decideSet(input: SystemOneInput): Promise<SystemOneDecision[]>;
  decide(input: SystemOneInput): Promise<SystemOneDecision>;
}
type SystemOneDecision = {
  kind: "choice" | "score" | "gate" | "abstain";
  label: string; choice?: string; score?: number; allow?: boolean;
  reason: string; provider: string; ttl?: number;
};
```

- `ruleBasedDecisionLayer` — deterministic keyword/heuristic classification
  (no network): intent (`commercial` / `support` / `handoff` / `other`) and a
  gate. Default provider is **Jev**; **Laya** is a swappable alternative behind
  the same interface.
- `createHostedDecisionLayer` — fetch adapter for a hosted Jev/Laya API
  (`POST {baseUrl}/v1/decisions`), resolved per tenant when
  `agent_config.decision_*` (or `DECISION_*` env) provides apiKey + baseUrl.
  Hosted calls run behind a per-process circuit breaker (3 failures in 60s →
  60s cooldown) and ANY failure falls through to the rules layer.
- `decideForTurn()` — never throws; an outage degrades to `abstain` whose
  `allow` follows the label's degradation posture (`LABEL_DEGRADATION`:
  `intent`/`capability-group` fail open, `risk`/`role`/`escalation` and
  unknown labels fail closed).

**Where it runs:** consulted *before* `generateText` in the customer flow
(`src/lib/agent/index.ts`), and intended to run at the same point in the
internal voice flow. Today a `gate` decision that disallows the turn suppresses
the toolset (the model still answers, without acting); the customer handoff path
stays owned upstream by the session policy. When a hosted Jev/Laya API is
configured it replaces the rules layer without touching either agent.

**Data flow (hosted):** each turn sends the message `text` + numeric
`tenantId` + a context allowlist (`sessionState`, `role`, `channel`) to
`decision_base_url` — never phone numbers, names, or provider external ids
(see `docs/security.md`). Request bodies are never logged; only the decision
kind/choice/reason is.

### Internal voice agent — interfaces implemented, plumbing planned

`src/lib/voice/`:

- `buildInternalVoiceAgent({ tenantId, role, instructions })` → composes a
  Realtime session config: model (`REALTIME_MODEL`, default
  `gpt-4o-realtime-preview`), voice (`REALTIME_VOICE`, default `alloy`),
  instructions, and `toRealtimeTools(selectCapabilities(internal, role))`.
- `createVoiceToolRunner({ tenantId, role })` → the function-call bridge that
  executes capability calls, tenant-scoped and role-gated by construction.

The WebSocket/session plumbing and audio are intentionally **not implemented**;
this is the seam the future implementation plugs into.

## Storefront + pre-agent order capture (design)

Today both reference apps expose a decisive idea the base should adopt: **capture
the order as structured data *before* the LLM sees any message**, so the agent
*confirms* a structured order instead of trying to reconstruct it from free text.

Reference flows:

- **muzapp** (food): admin loads products → public storefront
  (`(storefront)/hamburguesas`, `pan-mayorista`, `promo/[slug]`) + a
  `/carta-digital` digital menu read from `/api/products` → cart → `POST
  /api/checkout`. The checkout is **server-priced** (never trusts client
  prices), checks stock atomically, dedups by `requestId`, stores an `orders`
  row, and returns a `{ orderId, total, whatsappUrl }` receipt carrying a
  `Referencia WEB:<uuid>`. `extractWebOrderReference(text)` lets the agent
  recognize a message that came from a structured web order. An
  `agent_config.web_order_redirect_enabled` toggle sends first-contact
  customers to the web ordering flow.
- **dentalogic** (clinic): a strongly multi-tenant engine where the agent only
  maps free text → structured rows (appointment/professional) inside
  tenant-scoped tools; **no draft/confirmation object** and no pre-agent capture
  — the gap this base should close.

### Proposed base design (not yet implemented)

1. **Business identity lives in `agent_config`** (`metaBusinessName` exists;
   add tagline/address/instagram/website/description) so one deployment renders
   the public storefront from config — no hardcoding (muzapp's `businessName`
   fields are the template; make it tenant-scoped, not `id = 1`).
2. **Public catalog routes** read `products` (already exist) filtered by
   `tenant_id` + `available`, rendered with `imageUrl` + info. Add a
   `storefront` route group and a digital-menu route.
3. **Structured checkout**: a `POST /api/checkout`-style endpoint that prices
   server-side, validates stock, dedups by `requestId`, writes an `orders` row,
   and returns a receipt with a `WEB:<ref>` reference.
4. **Pre-agent handoff**: the checkout returns a `wa.me` link containing the
   `WEB:<ref>`; when the customer's WhatsApp message arrives, the deterministic
   layer (System One) detects the reference and routes it to a
   *confirm structured order* capability — the LLM reads the order, does not
   re-parse free text, and confirms.
5. **Admin toggle** (`agent_config.web_order_redirect_enabled`) to send
   first-contact customers to the storefront.

This is the concrete shape of "the order arrives at the agent already
structured, to confirm it."

## Reference architectures we imitate (not copy)

- **Engram** — curated, versioned observations; *search first, then fetch*.
  → our `knowledge_chunks` + `retrieveKnowledge` + idempotent re-ingest.
- **Gentle AI / Gentleman.Dots** — a thin config/orchestration layer over
  pluggable capabilities; no vendor lock-in. → our provider registries
  (messaging, AI, embeddings, vector store, decision layer).
- **ClinicForge "Nova" / dentalogic** — ~50 role-gated tools in OpenAI
  function-calling format, grouped by category; tenant resolution and
  `tenant_id` on every statement; a self-healing "maintenance robot".
  → our capability registry (role/surface gating), provider-agnostic core, and
  the `group → role` taxonomy to grow into.
- **muzapp** — agnostic storefront from admin-loaded catalog + structured,
  server-priced checkout with a `WEB:<ref>` handoff.

## Roadmap (each its own change)

- Hosted Jev/Laya decision provider behind `DecisionLayer`.
- Internal voice agent: Realtime session + audio + tool-call bridge.
- Storefront: business-identity fields (tenant-scoped), public catalog +
  digital menu, structured checkout, `WEB:<ref>` pre-agent confirmation.
- Instagram + Facebook channels (see `docs/channels-meta.md`).
- Deploy targets local / VPS / Render with Neon default (see
  `docs/deployment.md`).
