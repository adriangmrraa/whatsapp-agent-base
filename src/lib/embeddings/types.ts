// ─── Embeddings & vector store abstraction ──────────────────────────────────
//
// Mirrors the MessagingProvider pattern: the engine/agent import only the
// high-level ingest/retrieve helpers, never a vendor SDK. Swapping the
// embedding vendor (OpenAI → any OpenAI-compatible endpoint) or the vector
// store (pgvector → a hosted service) is a registry change, not an engine
// change.

/** A provider that turns text into fixed-dimension embedding vectors. */
export interface EmbeddingProvider {
  /** Provider id, e.g. "openai". */
  readonly provider: string;
  /** Model id, e.g. "text-embedding-3-small". */
  readonly model: string;
  /** Vector dimension emitted by the model (1536 for text-embedding-3-small). */
  readonly dimensions: number;
  /** Embed a batch of texts — same order as the input. */
  embed(texts: string[]): Promise<number[][]>;
  /** Embed a single text (query path). */
  embedOne(text: string): Promise<number[]>;
}

/** A chunk ready to be persisted (content + its embedding + provenance). */
export interface EmbeddedChunk {
  documentKey: string;
  source: string;
  title?: string | null;
  content: string;
  contentHash: string;
  chunkIndex: number;
  tokenCount?: number | null;
  embedding: number[];
  embeddingModel: string;
  metadata?: Record<string, unknown>;
}

/** One retrieval hit. `score` is cosine similarity in [0, 1] (higher = closer). */
export interface VectorMatch {
  id: number;
  documentKey: string;
  source: string;
  title: string | null;
  content: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
}

/** A tenant-scoped semantic store. `tenantId` is mandatory on every method. */
export interface VectorStore {
  /** Replace-or-insert chunks atomically. Returns rows written. */
  upsert(input: { tenantId: number; chunks: EmbeddedChunk[] }): Promise<number>;
  /** Cosine top-k search, always scoped to the tenant. */
  search(input: {
    tenantId: number;
    embedding: number[];
    k: number;
    minScore?: number;
    source?: string;
  }): Promise<VectorMatch[]>;
  /** Remove every chunk of a logical document for the tenant. */
  deleteDocument(input: { tenantId: number; documentKey: string }): Promise<number>;
  /** Current content hashes of a document (idempotency check). */
  listHashes(input: { tenantId: number; documentKey: string }): Promise<string[]>;
  /** Count the tenant's chunks (health / onboarding checks). */
  count(input: { tenantId: number }): Promise<number>;
}
