import type { EmbeddingProvider } from "./types";

// ─── OpenAI-compatible embedding adapter ─────────────────────────────────────
//
// Thin fetch adapter against the OpenAI `/embeddings` contract. Works with any
// OpenAI-compatible endpoint (the tenant's base_url decides where requests go).
// Requests are batched to stay well under the API's per-request input limit.

const MAX_BATCH = 64;

interface EmbeddingsResponse {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message?: string };
}

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingOptions,
): EmbeddingProvider {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/embeddings`;
  const doFetch = options.fetchFn ?? fetch;
  // `dimensions` is only accepted by the text-embedding-3 family.
  const supportsDimensions = options.model.startsWith("text-embedding-3");

  async function embedBatch(texts: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = {
      input: texts,
      model: options.model,
      encoding_format: "float",
    };
    if (supportsDimensions) body.dimensions = options.dimensions;

    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `embedding request failed: ${res.status} ${detail.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as EmbeddingsResponse;
    if (json.error) {
      throw new Error(`embedding request failed: ${json.error.message ?? "unknown"}`);
    }
    const rows = json.data ?? [];
    const out = new Array<number[]>(texts.length);
    for (const row of rows) out[row.index] = row.embedding;
    return out;
  }

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const vectors = await embedBatch(batch);
      out.push(...vectors);
    }
    return out;
  }

  return {
    provider: "openai",
    model: options.model,
    dimensions: options.dimensions,
    embed,
    async embedOne(text: string): Promise<number[]> {
      const [vector] = await embed([text]);
      return vector;
    },
  };
}
