# Embeddings & Vector Memory — Specification

**Change**: `embeddings-vector-memory`
**Project**: whatsapp-business-base
**Phase**: Proposal → Spec → Design → Tasks
**Status**: In progress
**Date**: 2026-10-10

---

## Proposal

### Intent

Turn the base from "a WhatsApp bot" into the **operational brain of any
business**: one engine (tools + data + tenant + deterministic decision layer +
vector memory) feeding customer-facing and staff-facing agents. This change
delivers the missing memory primitive: a **tenant-scoped semantic knowledge
store** the agent consults before generating a reply.

### Why a vector store

The catalog and `agent_config` fields cover structured facts. Business
knowledge (policies, FAQs, product prose, delivery rules, opening nuances) is
unstructured and does not fit a column. Today it is dumped raw into the system
prompt (`train_bot_context` / `whatsappInstructions`) or the model never sees
it. Vector retrieval lets the tenant ingest arbitrary documents and inject only
the *relevant* top-k chunks per message — smaller prompts, grounded answers,
no hallucinated policies.

### Scope

- A tenant-scoped `knowledge_chunks` table on Postgres via **pgvector**
  (Neon-native), embedding stored next to the data.
- An **embedding provider abstraction** mirroring `MessagingProvider`: default
  OpenAI `text-embedding-3-small`/`large`, swappable to any OpenAI-compatible
  endpoint per tenant.
- An **ingest pipeline**: chunk → embed → upsert (idempotent via content hash).
- A **retrieval API** (cosine top-k, tenant-scoped) called before
  `generateText` and exposed as an agent tool.
- Interfaces so the future **internal voice agent** (OpenAI Realtime) and the
  **System One** deterministic decision layer reuse the same tools/data/store.

### Out of scope (this change)

- Voice/Realtime implementation (interfaces only).
- System One runtime (interface + deterministic default only).
- Instagram/Facebook adapters (design doc only).
- Hosted vector services (Pinecone etc.) — the abstraction leaves room.

---

## Design

### Layer placement

```
src/lib/embeddings/
  types.ts        EmbeddingProvider · VectorStore contracts (provider-agnostic)
  config.ts       per-tenant embedding config (agent_config → env fallback)
  openai.ts       OpenAI-compatible adapter (POST /embeddings)
  registry.ts     getEmbeddingProvider() / getVectorStore()
  chunker.ts      pure text → chunks (paragraph/sentence aware, overlap)
  store.ts        PgVectorStore over knowledge_chunks (tenant-scoped)
  ingest.ts       ingestKnowledge() — chunk+embed+upsert, idempotent
  retrieve.ts     retrieveKnowledge() — embed query → cosine top-k
```

The engine and agent import only `ingest`/`retrieve`; they never see the
provider SDK or raw SQL. Swapping the embedding vendor or the store is a
registry change, exactly like `src/lib/providers/`.

### Provider abstraction (mirrors MessagingProvider)

```ts
interface EmbeddingProvider {
  readonly provider: string;      // "openai"
  readonly model: string;         // "text-embedding-3-small"
  readonly dimensions: number;    // 1536
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

interface VectorStore {
  upsert(input: { tenantId; chunks: StoredChunk[] }): Promise<number>;
  search(input: { tenantId; embedding; k; minScore?; source? }): Promise<VectorMatch[]>;
  deleteDocument(input: { tenantId; documentKey }): Promise<number>;
  count(input: { tenantId }): Promise<number>;
}
```

### Per-tenant config

`embedding_config` (new nullable columns on `agent_config`) with env fallback,
same precedence as `ai_*`:

| Config | Env fallback |
|---|---|
| `embedding_api_key` | `EMBEDDING_API_KEY` → `OPENAI_API_KEY` |
| `embedding_base_url` | `EMBEDDING_BASE_URL` → `AI_BASE_URL` |
| `embedding_model` | `EMBEDDING_MODEL` (default `text-embedding-3-small`) |
| `embedding_dimensions` | `EMBEDDING_DIMENSIONS` (default `1536`) |

The dimension is fixed in the column type; changing it requires a migration.
Documented as a known constraint (default 1536 keeps storage small).

### Data model — `knowledge_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `tenant_id` | int NOT NULL FK tenants | isolation boundary |
| `document_key` | varchar(255) NOT NULL | logical doc, e.g. `faq/shipping` |
| `source` | varchar(100) NOT NULL | `manual` \| `catalog` \| `policy` \| `faq` \| `custom` |
| `title` | varchar(255) | |
| `content` | text NOT NULL | chunk text |
| `content_hash` | varchar(64) NOT NULL | sha256(content) |
| `chunk_index` | int NOT NULL default 0 | |
| `token_count` | int | rough estimate |
| `embedding` | vector(1536) NOT NULL | pgvector |
| `embedding_model` | varchar(100) NOT NULL | provenance |
| `metadata` | jsonb default {} | |
| `created_at` / `updated_at` | timestamptz | |

Indexes:

- `UNIQUE (tenant_id, document_key, content_hash)` — re-ingesting identical
  content is a no-op (idempotent); different content inserts.
- `INDEX (tenant_id)` — every query filters here first.
- `HNSW (embedding vector_cosine_ops)` — cosine ANN.

### Ingest idempotency

`ingestKnowledge({ tenantId, documentKey, source, title, text, metadata })`:

1. Chunk the text.
2. Hash each chunk.
3. Read existing `(content_hash)` set for `(tenant_id, document_key)`.
4. If the new hash set equals the stored set → return `{ skipped: true }`.
5. Otherwise delete chunks for `(tenant_id, document_key)` and insert the new
   set in one transaction. A re-ingest of unchanged content never re-embeds.

### Retrieval

`retrieveKnowledge({ tenantId, query, k = 4, minScore = 0.3 })`:

1. `embedOne(query)` with the tenant's provider.
2. `PgVectorStore.search` — `WHERE tenant_id = $1 AND (1 - (embedding <=> $q)) > minScore`
   `ORDER BY embedding <=> $q LIMIT k`.
3. Return `{ context: string, matches: VectorMatch[] }` where `context` is a
   compact, delimited block ready to append to the system prompt.

The store **always** filters `tenant_id` — a missing filter is a data leak.

### Agent wiring

In `src/lib/agent/index.ts` `processMessage`:

- Before `generateText`, call `retrieveKnowledge(tenantId, text)`.
- Append a `## Conocimiento relevante` block to the system prompt when there
  are matches. Retrieval failure is **best-effort**: log and continue (it is
  not an authenticity/mutation path, so it does not fail closed — a reply
  without extra context beats no reply).
- Add a `searchKnowledge` tool inside `buildAgentTools(tenantId, phone)` so the
  model can retrieve on demand. Tenant-scoped by construction.

### Future reuse (internal voice agent + System One)

The **tool set and vector store must be channel/agent agnostic**. This change
lays the seams without implementing the agents:

- `src/lib/capabilities/` — a `CapabilityDescriptor` registry that describes
  every tool (name, description, JSON schema, required roles, execute). The
  existing AI-SDK tools become one projection of it; an OpenAI Realtime
  function-calling payload and a role-gated internal-staff tool set become
  other projections.
- `src/lib/system-one/` — a `DecisionLayer` interface returning
  `choice | score | null` with a deterministic default; designed to gate which
  capability groups are offered before the LLM runs.

These are interface-first, documented, and safe no-ops until an agent calls
them.

---

## Requirements

### R1 — Tenant-scoped vector store

Every read/write on `knowledge_chunks` MUST filter `tenant_id`. `search`
MUST NOT be callable without a tenant.

- GIVEN tenants A and B both ingested a document named `faq/hours`
- WHEN tenant A retrieves "horario"
- THEN no chunk belonging to tenant B is returned.

### R2 — Idempotent ingest

- GIVEN a document is ingested once
- WHEN the identical content is ingested again
- THEN no new rows are written and the result reports `skipped: true`.
- GIVEN the content changed
- WHEN re-ingested
- THEN the document's old chunks are replaced atomically.

### R3 — Provider swap

- GIVEN `embedding_base_url` points at an OpenAI-compatible endpoint
- WHEN retrieval runs
- THEN the request is sent to that endpoint via the abstraction, not a
  hardcoded OpenAI URL.

### R4 — Grounded replies

- GIVEN a tenant has ingested a policy chunk about refunds
- WHEN a customer asks about refunds and `processMessage` runs
- THEN the retrieved context MUST be present in the system prompt.

### R5 — Safe degradation

- GIVEN the embedding endpoint is unreachable
- WHEN `processMessage` runs
- THEN the reply is still generated (no context) and the error is logged.

### R6 — Interfaces for future agents

- The capability registry MUST express each tool in a provider-neutral shape.
- The System One interface MUST be implementable without touching the agent.

---

## Tasks

1. `docs/specs/embeddings-vector-memory.md` — this spec.
2. `feat(db)`: `knowledge_chunks` + `agent_config.embedding_*` columns +
   migration `0002` (hand-written, `CREATE EXTENSION IF NOT EXISTS vector`).
3. `feat(embeddings)`: provider abstraction + OpenAI adapter + per-tenant
   config + registry + `.env.example`.
4. `feat(embeddings)`: chunker + PgVectorStore + ingest + retrieve.
5. `feat(agent)`: retrieval before `generateText` + `searchKnowledge` tool.
6. `feat(capabilities)`: capability registry + System One + Realtime interfaces.
7. `docs`: `docs/embeddings.md` + architecture/ai-engine/README updates;
   channels + deployment design docs.
