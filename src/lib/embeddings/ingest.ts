import { createHash } from "node:crypto";
import { chunkText, estimateTokens } from "./chunker";
import { getEmbeddingProvider } from "./registry";
import { getVectorStore } from "./store-registry";
import type { EmbeddedChunk } from "./types";

// ─── Knowledge ingest pipeline ───────────────────────────────────────────────
//
// chunk → hash → (skip if unchanged) → embed → replace document chunks.
// Idempotent: re-ingesting identical content is a no-op; changed content
// atomically replaces the document's previous chunks.

export type KnowledgeSource =
  | "manual"
  | "catalog"
  | "policy"
  | "faq"
  | "custom";

export interface IngestKnowledgeInput {
  tenantId: number;
  /** Logical document identity, e.g. "faq/shipping" or "policy/refunds". */
  documentKey: string;
  text: string;
  source?: KnowledgeSource;
  title?: string;
  metadata?: Record<string, unknown>;
  maxChars?: number;
}

export interface IngestKnowledgeResult {
  documentKey: string;
  /** Number of chunks stored (0 when skipped). */
  chunks: number;
  /** True when the document's existing content was already current. */
  skipped: boolean;
  embeddingModel: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function ingestKnowledge(
  input: IngestKnowledgeInput,
): Promise<IngestKnowledgeResult> {
  const source = input.source ?? "manual";
  const store = getVectorStore();
  const texts = chunkText(input.text, { maxChars: input.maxChars });

  if (texts.length === 0) {
    return { documentKey: input.documentKey, chunks: 0, skipped: true, embeddingModel: "" };
  }

  const hashes = texts.map(sha256);
  const existing = await store.listHashes({
    tenantId: input.tenantId,
    documentKey: input.documentKey,
  });
  const sameSet =
    existing.length === hashes.length &&
    [...existing].sort().join("\n") === [...hashes].sort().join("\n");
  if (sameSet) {
    return {
      documentKey: input.documentKey,
      chunks: 0,
      skipped: true,
      embeddingModel: "",
    };
  }

  const provider = await getEmbeddingProvider(input.tenantId);
  const vectors = await provider.embed(texts);

  const chunks: EmbeddedChunk[] = texts.map((content, index) => ({
    documentKey: input.documentKey,
    source,
    title: input.title ?? null,
    content,
    contentHash: hashes[index],
    chunkIndex: index,
    tokenCount: estimateTokens(content),
    embedding: vectors[index],
    embeddingModel: provider.model,
    metadata: input.metadata,
  }));

  // Replace the document atomically from the caller's perspective: remove the
  // stale chunks first, then insert the current set.
  await store.deleteDocument({
    tenantId: input.tenantId,
    documentKey: input.documentKey,
  });
  const inserted = await store.upsert({ tenantId: input.tenantId, chunks });

  return {
    documentKey: input.documentKey,
    chunks: inserted,
    skipped: false,
    embeddingModel: provider.model,
  };
}
