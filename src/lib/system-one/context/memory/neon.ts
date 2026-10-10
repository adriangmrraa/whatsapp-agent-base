import { and, desc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { db } from "@/db";
import { jenMemory } from "@/db/schema";
import * as schema from "@/db/schema";
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
// Scope is EXPLICIT, never absent: a numeric tenantId filters
// `tenant_id = $n`; a null tenantId (the dev harness has no tenant) filters
// `tenant_id IS NULL` (the harness/global rows). It never runs an unscoped
// query, so product rows (which always carry a tenant_id) can never leak.
//
// The whole DB surface is behind `NeonMemoryClient` so the provider itself is
// unit-testable with an injected fake. The default client is built either from
// the shared Drizzle connection (the app) or from an explicit DATABASE_URL (a
// standalone harness) — both are created LAZILY so importing is build-safe.
// Like every MemoryProvider, it fails SOFT.

/** Tenant scope: numeric → equality; null → harness/global (IS NULL). */
type TenantId = number | null;

function tenantScope(tenantId: TenantId): SQL {
  return tenantId === null
    ? isNull(jenMemory.tenantId)
    : eq(jenMemory.tenantId, tenantId);
}

export interface JenMemoryRow {
  id: string;
  title: string;
  type: string;
  topicKey: string | null;
  project: string;
  content: string;
}

export interface NeonMemorySearchInput {
  tenantId: TenantId;
  project: string;
  query: string;
  limit: number;
}

export interface NeonMemoryClient {
  search(input: NeonMemorySearchInput): Promise<JenMemoryRow[]>;
  get(input: { tenantId: TenantId; project: string; id: string }): Promise<JenMemoryRow | null>;
  save(
    input: {
      tenantId: TenantId;
      project: string;
      title: string;
      topicKey: string;
      type: string;
      content: string;
    },
  ): Promise<string>;
  recent(input: { tenantId: TenantId; project: string; limit: number }): Promise<JenMemoryRow[]>;
}

export const NEON_DEFAULT_PROJECT = "default";
const RECENT_LIMIT = 10;

export interface NeonDrizzleClientOptions {
  /**
   * Standalone-harness connection string. When provided, the client builds its
   * own Neon HTTP connection instead of using the app's shared `db` proxy.
   */
  databaseUrl?: string;
}

/**
 * Drizzle-backed client. The connection is created LAZILY (on first query), so
 * importing this module — and calling the factory — is build- and test-safe
 * even with no DATABASE_URL present.
 */
export function createNeonDrizzleClient(
  options: NeonDrizzleClientOptions = {},
): NeonMemoryClient {
  let cached: typeof db | null = null;

  function database(): typeof db {
    if (!cached) {
      cached = options.databaseUrl
        ? drizzle(neon(options.databaseUrl), { schema })
        : db;
    }
    return cached;
  }

  return {
    async search({ tenantId, project, query, limit }) {
      const rows = await database()
        .select()
        .from(jenMemory)
        .where(
          and(
            tenantScope(tenantId),
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
      const [row] = await database()
        .select()
        .from(jenMemory)
        .where(
          and(
            tenantScope(tenantId),
            eq(jenMemory.project, project),
            eq(jenMemory.id, numeric),
          ),
        )
        .limit(1);
      return row ? toRow(row) : null;
    },

    async save({ tenantId, project, title, topicKey, type, content }) {
      const [row] = await database()
        .insert(jenMemory)
        .values({ tenantId, project, title, topicKey, type, content })
        .returning({ id: jenMemory.id });
      return String(row.id);
    },

    async recent({ tenantId, project, limit }) {
      const rows = await database()
        .select()
        .from(jenMemory)
        .where(and(tenantScope(tenantId), eq(jenMemory.project, project)))
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
  /**
   * Tenant scope. A number scopes to that tenant (the product always sets it);
   * `null`/omitted means the harness/global scope (`tenant_id IS NULL`).
   */
  tenantId?: TenantId;
  project?: string;
  /** Injectable for tests; defaults to the Drizzle-backed client. */
  client?: NeonMemoryClient;
  /** Standalone-harness connection string (used only when `client` is absent). */
  databaseUrl?: string;
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
  const tenantId: TenantId = options.tenantId ?? null;
  const client =
    options.client ??
    createNeonDrizzleClient({ databaseUrl: options.databaseUrl });
  const project = options.project ?? NEON_DEFAULT_PROJECT;

  return {
    name: "neon",

    async search(query: string, opts?: MemorySearchOptions): Promise<MemRef[]> {
      try {
        const rows = await client.search({
          tenantId,
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
          tenantId,
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
          tenantId,
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
          tenantId,
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
