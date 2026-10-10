# AI Engine

The AI is a per-tenant, OpenAI-compatible agent wrapped in a deterministic
safety layer. The LLM is only reached when the session policy says
`allow_agent` — everything else is handled by fixed replies or silence.

## Per-tenant AI configuration

`src/lib/ai/config.ts` — `getAIConfig(tenantId)`:

- Reads `agent_config.ai_*` for the tenant, falls back to env.
- `AI_BASE_URL` + `AI_MODEL` / `AI_MODEL_FAST` / `AI_MODEL_VISION`.
- Any OpenAI-compatible endpoint works: OpenAI, OpenRouter, DeepSeek, Groq,
  Together, Ollama. DeepSeek gets a fetch wrapper disabling thinking modes
  that break required tool calls.

## Agent tools

`src/lib/agent/tools.ts` — `buildAgentTools(tenantId, phoneNumber)` returns a
fresh tool set per call. **Every tool query is tenant-scoped by construction**;
there is no shared/global tool instance. The shipped tools cover the generic
commerce surface:

- catalog lookup / product search / suggestions / product image sending
- order create, status, add-to-existing
- business hours, business info, delivery check
- customer history, promotions, address persistence
- human handoff

To add domain tools (booking, stock, kitchen queues), add them inside
`buildAgentTools` — keep the tenant scope on every `where`.

## Session policy (the anti-LLM firewall)

`src/lib/whatsapp/session-policy.ts` + `session-store.ts`.

State per conversation (`conversation_session_states`):

```
version · policyVersion · episode · mode
ackSent · clarificationSent
commercialIntent · pendingQuestion
hasActiveOrder · activeOrderId · hasActiveCart · hasAddressReference
recentAssetKinds[]
```

Decisions (`RoutingDecision.kind`):

| kind | meaning | LLM? |
|---|---|---|
| `fixed_ack` | first casual/personal message → canned ack | no |
| `fixed_clarification` | ambiguous follow-up → one clarifying question | no |
| `handoff` | human requested → claim effects, override | no |
| `blocked` | human override / suppressed | no |
| `duplicate` | replayed delivery | no |
| `allow_agent` | commercial flow | yes |

Persistence is **compare-and-swap** on `version`: concurrent deliveries of the
same webhook cannot both transition state. `persistSessionTransition` also
writes a durable `conversation_session_events` audit row keyed
`(conversation_id, inbound_message_id)` — replays are absorbed.

## Idempotent side effects

`conversation_session_effect_claims` — unique on
`(conversation_id, episode, effect_kind, claimant)`. Handoff performs three
effects (owner notification, customer reply, human override); each is claimed
before it fires, so retries never double-notify.

## Buffer (debounce)

`src/lib/buffer/` — Redis with in-memory fallback. Rapid consecutive messages
from a customer are coalesced: each enqueue refreshes a short timer; on flush,
all buffered text is concatenated and the agent runs once. Without Redis the
in-memory fallback works for a single instance (dev only).

Flush paths:
- The enqueue timer itself (inline debounce).
- `POST /api/cron/flush` — serverless safety net, drains stranded buffers and
  the outbound queue. Protect with `CRON_SECRET` + a scheduler (Vercel Cron).

## Queue, DLQ, circuit breaker

`src/lib/queue/` — outbound sends and agent work can be pushed through a
durable queue with exponential backoff; poisoned items land in the DLQ.
`src/lib/infra/circuit-breaker.ts` wraps provider calls: repeated failures open
the circuit instead of hammering a downed API.

## Prompt assembly

`src/lib/agent/system-prompt.ts` — per-tenant: `agent_config` system prompt +
business fields + the tenant's catalog summary. The agent input additionally
receives **compact session facts** (not the raw state row): pending question,
active order, cart flag — enough to continue the conversation coherently.
