import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeChunks } from "@/db/schema";
import type { EmbeddedChunk, VectorMatch, VectorStore } from "./types";

// ─── pgvector-backed vector store ────────────────────────────────────────────
//
// Every statement filters `tenant_id` — the isolation boundary. `tenantId` is
// required on every method; there is no cross-tenant search path.

export class PgVectorStore implements VectorStore {
  async upsert(input: {
    tenantId: number;
    chunks: EmbeddedChunk[];
  }): Promise<number> {
    if (input.chunks.length === 0) return 0;
    const rows = input.chunks.map((chunk) => ({
      tenantId: input.tenantId,
      documentKey: chunk.documentKey,
      source: chunk.source,
      title: chunk.title ?? null,
      content: chunk.content,
      contentHash: chunk.contentHash,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount ?? null,
      embedding: chunk.embedding,
      embeddingModel: chunk.embeddingModel,
      metadata: chunk.metadata ?? {},
    }));
    const inserted = await db
      .insert(knowledgeChunks)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: knowledgeChunks.id });
    return inserted.length;
  }

  async search(input: {
    tenantId: number;
    embedding: number[];
    k: number;
    minScore?: number;
    source?: string;
  }): Promise<VectorMatch[]> {
    if (input.embedding.length === 0) return [];
    const minScore = input.minScore ?? 0;
    const similarity = sql<number>`1 - (${cosineDistance(
      knowledgeChunks.embedding,
      input.embedding,
    )})`;

    const conditions = [
      eq(knowledgeChunks.tenantId, input.tenantId),
      gt(similarity, minScore),
    ];
    if (input.source) {
      conditions.push(eq(knowledgeChunks.source, input.source));
    }

    const rows = await db
      .select({
        id: knowledgeChunks.id,
        documentKey: knowledgeChunks.documentKey,
        source: knowledgeChunks.source,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
        chunkIndex: knowledgeChunks.chunkIndex,
        metadata: knowledgeChunks.metadata,
        score: similarity,
      })
      .from(knowledgeChunks)
      .where(and(...conditions))
      .orderBy(desc(similarity))
      .limit(input.k);

    return rows.map((row) => ({
      id: row.id,
      documentKey: row.documentKey,
      source: row.source,
      title: row.title,
      content: row.content,
      chunkIndex: row.chunkIndex,
      score: Number(row.score),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }

  async deleteDocument(input: {
    tenantId: number;
    documentKey: string;
  }): Promise<number> {
    const deleted = await db
      .delete(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, input.tenantId),
          eq(knowledgeChunks.documentKey, input.documentKey),
        ),
      )
      .returning({ id: knowledgeChunks.id });
    return deleted.length;
  }

  async listHashes(input: {
    tenantId: number;
    documentKey: string;
  }): Promise<string[]> {
    const rows = await db
      .select({ contentHash: knowledgeChunks.contentHash })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, input.tenantId),
          eq(knowledgeChunks.documentKey, input.documentKey),
        ),
      );
    return rows.map((row) => row.contentHash);
  }

  async count(input: { tenantId: number }): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.tenantId, input.tenantId));
    return Number(row?.count ?? 0);
  }
}
