import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { jenMemory } from "@/db/schema";
import type {
  MemRef,
  MemoryContextOptions,
  MemoryProvider,
  MemorySaveInput,
  MemorySearchOptions,
} from "./types";

// ─── Neon memory provider (app Postgres `jen_memory` table) ──────────────────
//
// A portable, tenant-scoped memory for deployments with no local Engram. The
// table is `jen_memory` (see src/db/schema.ts), always scoped by BOTH
// `tenant_id` (isolation law) and `project` (harness namespace). Search is a
// simple case-insensitive substring match — no embeddings required.
//
// The whole DB surface is behind `NeonMemoryClient` so the provider itself is
// unit-testable with an injected fake; the default client lazily touches the
// shared Drizzle connection. Like every MemoryProvider, it fails SOFT.

export interface JenMemoryRow {
  id: string;
  title: string;
  type: string;
  topicKey: string | null;
  project: string;
  content: string;
}

export interface NeonMemorySearchInput {
  tenantId: number;
  project: string;
  query: string;
  limit: number;
}

export interface NeonMemoryClient {
  search(input: NeonMemorySearchInput): Promise<JenMemoryRow[]>;
  get(input: { tenantId: number; project: string; id: string }): Promise<JenMemoryRow | null>;
  save(
    input: {
      tenantId: number;
      project: string;
      title: string;
      topicKey: string;
      type: string;
      content: string;
    },
  ): Promise<string>;
  recent(input: { tenantId: number; project: string; limit: number }): Promise<JenMemoryRow[]>;
}

export const NEON_DEFAULT_PROJECT = "default";
const RECENT_LIMIT = 10;

/** Drizzle-backed client. `db` is a lazy proxy, so importing is build-safe. */
export function createNeonDrizzleClient(): NeonMemoryClient {
  return {
    async search({ tenantId, project, query, limit }) {
      const rows = await db
        .select()
        .from(jenMemory)
        .where(
          and(
            eq(jenMemory.tenantId, tenantId),
            eq(jenMemory.project, project),
            ilike(jenMemory.content, `%${query}%`),
          ),
        )
        .orderBy(desc(jenMemory.createdAt))
        .limit(limit);
      return rows.map(toRow);
    },

    async get({ tenantId, project, id }) {
      const numeric = Number.parseInt(id, 10);
      if (!Number.isFinite(numeric)) return null;
      const [row] = await db
        .select()
        .from(jenMemory)
        .where(
          and(
            eq(jenMemory.tenantId, tenantId),
            eq(jenMemory.project, project),
            eq(jenMemory.id, numeric),
          ),
        )
        .limit(1);
      return row ? toRow(row) : null;
    },

    async save({ tenantId, project, title, topicKey, type, content }) {
      const [row] = await db
        .insert(jenMemory)
        .values({ tenantId, project, title, topicKey, type, content })
        .returning({ id: jenMemory.id });
      return String(row.id);
    },

    async recent({ tenantId, project, limit }) {
      const rows = await db
        .select()
        .from(jenMemory)
        .where(
          and(eq(jenMemory.tenantId, tenantId), eq(jenMemory.project, project)),
        )
        .orderBy(desc(jenMemory.createdAt))
        .limit(limit);
      return rows.map(toRow);
    },
  };
}

function toRow(row: typeof jenMemory.$inferSelect): JenMemoryRow {
  return {
    id: String(row.id),
    title: row.title,
    type: row.type,
    topicKey: row.topicKey ?? null,
    project: row.project,
    content: row.content,
  };
}

export interface NeonMemoryOptions {
  tenantId: number;
  project?: string;
  /** Injectable for tests; defaults to the Drizzle-backed client. */
  client?: NeonMemoryClient;
}

function toRef(row: JenMemoryRow): MemRef {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    topicKey: row.topicKey ?? undefined,
    project: row.project,
    preview: row.content.slice(0, 300),
  };
}

export function createNeonMemoryProvider(
  options: NeonMemoryOptions,
): MemoryProvider {
  const client = options.client ?? createNeonDrizzleClient();
  const project = options.project ?? NEON_DEFAULT_PROJECT;

  return {
    name: "neon",

    async search(query: string, opts?: MemorySearchOptions): Promise<MemRef[]> {
      try {
        const rows = await client.search({
          tenantId: options.tenantId,
          project: opts?.project ?? project,
          query,
          limit: opts?.limit ?? 5,
        });
        return rows.map(toRef);
      } catch {
        return [];
      }
    },

    async get(id: string): Promise<string> {
      try {
        const row = await client.get({
          tenantId: options.tenantId,
          project,
          id,
        });
        return row?.content ?? "";
      } catch {
        return "";
      }
    },

    async save(input: MemorySaveInput): Promise<string> {
      try {
        return await client.save({
          tenantId: options.tenantId,
          project,
          title: input.title,
          topicKey: input.topicKey,
          type: input.type,
          content: input.content,
        });
      } catch {
        return "";
      }
    },

    async context(opts?: MemoryContextOptions): Promise<string> {
      try {
        const rows = await client.recent({
          tenantId: options.tenantId,
          project: opts?.project ?? project,
          limit: RECENT_LIMIT,
        });
        if (rows.length === 0) return "";
        return rows
          .map((row) => `- (${row.type}) ${row.title}`)
          .join("\n");
      } catch {
        return "";
      }
    },
  };
}
