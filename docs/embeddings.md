# Embeddings & vector memory

The base ships a **tenant-scoped semantic knowledge store** so the agent
answers from the business's own documents (policies, FAQs, product prose,
delivery rules) instead of dumping everything into the prompt or hallucinating.

The store is **pgvector on PostgreSQL** — the same database, one migration, one
`tenant_id` boundary. No hosted vector service required (Neon supports pgvector
natively). The vendor is abstracted away: swapping the embedding endpoint or the
store is a registry change, mirroring `MessagingProvider`.

## Layers

```
src/lib/embeddings/
  types.ts          EmbeddingProvider · VectorStore contracts
  config.ts         per-tenant embedding config (agent_config → env fallback)
  openai.ts         OpenAI-compatible /embeddings adapter (batched)
  registry.ts       getEmbeddingProvider(tenantId)
  store-registry.ts getVectorStore()
  store.ts          PgVectorStore over knowledge_chunks (tenant-scoped)
  chunker.ts        deterministic paragraph/sentence chunking with overlap
  ingest.ts         ingestKnowledge() — chunk+hash+embed+replace (idempotent)
  retrieve.ts       retrieveKnowledge() — cosine top-k → prompt context
  index.ts          public barrel
```

The engine/agent import only `ingest`/`retrieve`; they never touch a vendor SDK.

## Provider abstraction

```ts
interface EmbeddingProvider {
  provider: string;            // "openai"
  model: string;               // "text-embedding-3-small"
  dimensions: number;          // 1536
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

interface VectorStore {
  upsert({ tenantId, chunks }): Promise<number>;
  search({ tenantId, embedding, k, minScore?, source? }): Promise<VectorMatch[]>;
  deleteDocument({ tenantId, documentKey }): Promise<number>;
  listHashes({ tenantId, documentKey }): Promise<string[]>;
  count({ tenantId }): Promise<number>;
}
```

`tenantId` is mandatory on every `VectorStore` method — there is no
cross-tenant search path.

## Per-tenant configuration

Same precedence as the chat model (`agent_config.ai_*`): the tenant row wins, env
is the bootstrap fallback.

| `agent_config` | Env | Default |
|---|---|---|
| `embedding_api_key` | `EMBEDDING_API_KEY` → `OPENAI_API_KEY` | — |
| `embedding_base_url` | `EMBEDDING_BASE_URL` → `AI_BASE_URL` | `https://api.openai.com/v1` |
| `embedding_model` | `EMBEDDING_MODEL` | `text-embedding-3-small` |
| `embedding_dimensions` | `EMBEDDING_DIMENSIONS` | `1536` |

Any OpenAI-compatible `/embeddings` endpoint works (Azure OpenAI, OpenRouter,
Together, a local proxy). `dimensions` is only forwarded for the
`text-embedding-3-*` family.

> **Dimension is fixed in the schema**: the `embedding` column is
> `vector(1536)`. Switching to `text-embedding-3-large` (3072) requires a
> migration. `1536` keeps storage small and is plenty for FAQ/policy text.

## Schema

`knowledge_chunks` (migration `drizzle/0002_knowledge_chunks.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `tenant_id` | int NOT NULL → `tenants(id)` | isolation boundary |
| `document_key` | varchar(255) | logical doc, e.g. `faq/shipping` |
| `source` | varchar(100) | `manual` \| `catalog` \| `policy` \| `faq` \| `custom` |
| `title` | varchar(255) | |
| `content` | text | the chunk |
| `content_hash` | varchar(64) | sha256(content) |
| `chunk_index` | int | position within the document |
| `token_count` | int | rough estimate |
| `embedding` | vector(1536) NOT NULL | pgvector |
| `embedding_model` | varchar(100) | provenance |
| `metadata` | jsonb | |
| `created_at` / `updated_at` | timestamptz | |

Indexes: unique `(tenant_id, document_key, content_hash)`, btree `(tenant_id)`,
and HNSW `(embedding vector_cosine_ops)`.

The migration starts with `CREATE EXTENSION IF NOT EXISTS vector;` (needs a
Postgres with pgvector available — Neon: available by default).

## Ingest

```ts
import { ingestKnowledge } from "@/lib/embeddings";

await ingestKnowledge({
  tenantId,
  documentKey: "faq/envios",
  source: "faq",
  title: "Envíos y entregas",
  text: "Hacemos envíos en el centro...",
});
```

1. Chunk the text (paragraph → sentence → word, with overlap).
2. Hash each chunk; if the document's stored hashes are identical → **skip**.
3. Otherwise embed and **atomically replace** the document's chunks.

Re-ingesting unchanged content never re-embeds (no wasted spend); changed
content replaces the old chunks.

## Retrieval

```ts
import { retrieveKnowledge } from "@/lib/embeddings";

const { context } = await retrieveKnowledge({ tenantId, query, k: 4 });
```

- `embedOne(query)` with the tenant's provider.
- Cosine top-k: `WHERE tenant_id = $1 AND 1 - (embedding <=> $q) > minScore`,
  ordered by distance, `LIMIT k`.
- Returns a compact, delimited block ready to append to the system prompt.

## How it wires into the agent

`src/lib/agent/index.ts` `processMessage`:

1. **Retrieve** before `generateText` and append the context to the prompt.
2. **System One** (Jev) deterministic decision is consulted first (see
   `docs/agent-platform.md`).
3. A `searchKnowledge` tool inside `buildAgentTools(tenantId, phone)` lets the
   model query the knowledge base on demand — tenant-scoped by construction.

Retrieval is **best-effort**: an embedding-endpoint failure logs and continues
with no context — a grounded reply without memory beats no reply. (This is not
an authenticity/mutation path, so it does not fail closed.)

## Operating notes

- Retrieval requires an embedding provider (API key). Without one, `ingest`
  throws and `retrieve` returns empty — the agent still works.
- Ingestion is admin/batch work; call it from a server action or seed script.
- Never log chunk contents alongside tenant identifiers you would not expose.
