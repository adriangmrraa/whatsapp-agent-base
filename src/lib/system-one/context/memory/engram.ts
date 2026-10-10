import type {
  MemRef,
  MemoryContextOptions,
  MemoryProvider,
  MemorySaveInput,
  MemorySearchOptions,
} from "./types";

// ─── Engram memory provider (local HTTP API) ─────────────────────────────────
//
// Talks to the local Engram server (`engram serve`, default 127.0.0.1:7437).
// Verified contract:
//   GET  /search?q=&project=&limit=   → [ { id, title, type, topic_key,
//                                          project, content } ]
//   GET  /observations/{id}           → { content, ... }
//   GET  /context?project=            → { context }
//   POST /sessions                    → { id, status }   (id + project required)
//   POST /observations                → { id, status }   (session_id,title,content)
//
// `search` returns PREVIEWS (Engram's own previews are 300 chars); callers
// that need the full body use `get`. Everything fails SOFT — an unreachable
// server yields empty results, never an exception, because memory is advisory
// context and must not block a decision.

export const ENGRAM_DEFAULT_BASE_URL = "http://127.0.0.1:7437";
const DEFAULT_TIMEOUT_MS = 3_000;
const PREVIEW_CHARS = 300;

export interface EngramMemoryOptions {
  baseUrl?: string;
  /** Optional Bearer token (ENGRAM_HTTP_TOKEN). */
  token?: string;
  /** Default project for all calls. */
  project?: string;
  /** Session id used when saving; auto-derived from the project when omitted. */
  sessionId?: string;
  timeoutMs?: number;
  /**
   * Provider label. The transport is identical for every Engram endpoint; the
   * label lets the registry distinguish the local server (`engram`) from the
   * remote cloud server (`cloud`). Defaults to `engram`.
   */
  name?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface EngramObservation {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  topic_key?: unknown;
  project?: unknown;
  content?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function previewOf(content: string): string {
  return content.length > PREVIEW_CHARS ? content.slice(0, PREVIEW_CHARS) : content;
}

export function createEngramMemoryProvider(
  options: EngramMemoryOptions = {},
): MemoryProvider {
  const baseUrl = (options.baseUrl ?? ENGRAM_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchFn ?? fetch;
  const project = options.project;
  const sessionId =
    options.sessionId ?? `jev-harness-${project ?? "default"}`;

  function headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (options.token) h.authorization = `Bearer ${options.token}`;
    return h;
  }

  async function safeJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const res = await doFetch(url, {
        ...init,
        headers: { ...headers(), ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  return {
    name: options.name ?? "engram",

    async search(query: string, opts?: MemorySearchOptions): Promise<MemRef[]> {
      const params = new URLSearchParams({ q: query });
      const proj = opts?.project ?? project;
      if (proj) params.set("project", proj);
      params.set("limit", String(opts?.limit ?? 5));

      const rows = await safeJson<EngramObservation[]>(
        `${baseUrl}/search?${params.toString()}`,
      );
      if (!Array.isArray(rows)) return [];
      const refs: MemRef[] = [];
      for (const row of rows) {
        if (typeof row?.id !== "string" && typeof row?.id !== "number") continue;
        const content = str(row.content) ?? "";
        refs.push({
          id: String(row.id),
          title: str(row.title),
          type: str(row.type),
          topicKey: str(row.topic_key),
          project: str(row.project),
          preview: content ? previewOf(content) : undefined,
        });
      }
      return refs;
    },

    async get(id: string): Promise<string> {
      const row = await safeJson<EngramObservation>(
        `${baseUrl}/observations/${encodeURIComponent(id)}`,
      );
      return str(row?.content) ?? "";
    },

    async save(input: MemorySaveInput): Promise<string> {
      const proj = project ?? "default";
      // Ensure the session exists (Engram rejects observations without one).
      await safeJson(`${baseUrl}/sessions`, {
        method: "POST",
        body: JSON.stringify({ id: sessionId, project: proj }),
      });
      const saved = await safeJson<{ id?: unknown }>(`${baseUrl}/observations`, {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          title: input.title,
          content: input.content,
          type: input.type,
          topic_key: input.topicKey,
          project: proj,
          scope: "project",
        }),
      });
      const id = saved?.id;
      return typeof id === "string" || typeof id === "number" ? String(id) : "";
    },

    async context(opts?: MemoryContextOptions): Promise<string> {
      const params = new URLSearchParams();
      const proj = opts?.project ?? project;
      if (proj) params.set("project", proj);
      const data = await safeJson<{ context?: unknown }>(
        `${baseUrl}/context?${params.toString()}`,
      );
      return str(data?.context) ?? "";
    },
  };
}
