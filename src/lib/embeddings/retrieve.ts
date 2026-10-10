import { isEmbeddingsConfigured } from "./config";
import { getEmbeddingProvider } from "./registry";
import { getVectorStore } from "./store-registry";
import type { VectorMatch } from "./types";

// ─── Knowledge retrieval API ─────────────────────────────────────────────────
//
// retrieve → inject. Called by the agent before generateText to ground replies
// in the tenant's own documents. Best-effort by design: a retrieval failure
// must never block a reply (the agent just answers without extra context).

export interface RetrieveKnowledgeInput {
  tenantId: number;
  query: string;
  /** Maximum matches to return. */
  k?: number;
  /** Minimum cosine similarity (0..1). */
  minScore?: number;
  /** Restrict to a knowledge source. */
  source?: string;
}

export interface RetrievedKnowledge {
  context: string;
  matches: VectorMatch[];
}

const DEFAULT_K = 4;
const DEFAULT_MIN_SCORE = 0.25;

export function buildKnowledgeContext(matches: VectorMatch[]): string {
  if (matches.length === 0) return "";
  const blocks = matches.map((match, index) => {
    const label = match.title?.trim() || match.documentKey;
    return `[${index + 1}] (${match.source}: ${label})\n${match.content.trim()}`;
  });
  return [
    "## Conocimiento relevante del negocio",
    "Usá esta información si responde la consulta. Si no alcanza, usá las",
    "herramientas disponibles o derivá; no inventes datos.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export async function retrieveKnowledge(
  input: RetrieveKnowledgeInput,
): Promise<RetrievedKnowledge> {
  const query = input.query.trim();
  if (!query) return { context: "", matches: [] };

  try {
    if (!(await isEmbeddingsConfigured(input.tenantId))) {
      return { context: "", matches: [] };
    }
    const provider = await getEmbeddingProvider(input.tenantId);
    const embedding = await provider.embedOne(query);
    const matches = await getVectorStore().search({
      tenantId: input.tenantId,
      embedding,
      k: input.k ?? DEFAULT_K,
      minScore: input.minScore ?? DEFAULT_MIN_SCORE,
      source: input.source,
    });
    return { context: buildKnowledgeContext(matches), matches };
  } catch (error) {
    // Best-effort: never let memory lookup break the reply path.
    const { default: logger } = await import("@/lib/logger");
    logger.warn(
      { error, tenantId: input.tenantId },
      "[embeddings] retrieval failed — continuing without context",
    );
    return { context: "", matches: [] };
  }
}
