import type { State } from "../provider/types";
import type { MemoryProvider, MemRef } from "./memory/types";
import { redactState } from "./redact";

// ─── ContextPrimer — the glue between memory and a decision provider ─────────
//
// Before a pack decides, the primer assembles the `state` that will be sent to
// Jev/OpenAI: the task, curated memory (top-k, FULL content — never the 300-char
// preview), skill compact rules, and a candidate list for selection packs. It
// then redacts secrets/PII and trims everything to a token budget.
//
// Design rules (plan §2.3):
// - Retrieve top-k curated, never dump — `state` is billed on every call.
// - Always `mem_get_observation` for full content (search previews are short).
// - No secrets/PII in `state` (it may leave the process to a hosted API).
// - Deterministic assembly + budget so a decision is replayable.

export interface PrimerCandidate {
  path: string;
  snippet?: string;
}

export interface PrimerMemory {
  id: string;
  title?: string;
  content: string;
}

export interface PrimerInput {
  task: string;
  /** Memory queries; defaults to [task]. */
  queries?: string[];
  /** Compact skill/registry rules to inject verbatim. */
  rules?: string[];
  /** Candidate files/folders for selection packs (paths + snippets only). */
  candidates?: PrimerCandidate[];
  /** Compact facts (session state, role, ...). Redacted before emission. */
  facts?: Record<string, unknown>;
  /** Token budget for the whole state (default 8000, plan suggests ≤8–12k). */
  budgetTokens?: number;
  /** Max memory refs requested per query (default 5). */
  memoryLimit?: number;
  project?: string;
}

export interface PrimerResult {
  state: State;
  /** Estimated tokens of the produced state. */
  tokens: number;
  /** Memory refs actually included (id + title). */
  memories: PrimerMemory[];
  omittedMemories: number;
  omittedCandidates: number;
}

export interface ContextPrimer {
  build(packId: string, input: PrimerInput): Promise<PrimerResult>;
}

const DEFAULT_BUDGET_TOKENS = 8_000;
const DEFAULT_MEMORY_LIMIT = 5;

/** Rough token estimate (~4 chars/token) — good enough for budgeting. */
export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / 4);
}

function dedupeRefs(refs: MemRef[]): MemRef[] {
  const seen = new Set<string>();
  const out: MemRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push(ref);
  }
  return out;
}

async function gatherMemory(
  memory: MemoryProvider,
  input: PrimerInput,
): Promise<PrimerMemory[]> {
  const queries = (input.queries?.length ? input.queries : [input.task]).filter(
    (q) => q.trim().length > 0,
  );
  if (queries.length === 0) return [];

  const refLists = await Promise.all(
    queries.map((query) =>
      memory.search(query, {
        project: input.project,
        limit: input.memoryLimit ?? DEFAULT_MEMORY_LIMIT,
      }),
    ),
  );
  const refs = dedupeRefs(refLists.flat());

  const hydrated = await Promise.all(
    refs.map(async (ref) => ({
      id: ref.id,
      title: ref.title,
      content: await memory.get(ref.id),
    })),
  );

  return hydrated.filter((m) => m.content.length > 0 || (m.title ?? "").length > 0);
}

export function createContextPrimer(memory: MemoryProvider): ContextPrimer {
  return {
    async build(packId: string, input: PrimerInput): Promise<PrimerResult> {
      const budget = input.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
      let used = 0;

      // Task is mandatory; truncate it if it alone blows the budget.
      let task = input.task;
      if (estimateTokens(task) > budget) {
        task = task.slice(0, budget * 4);
      }
      used += estimateTokens(task);

      const state: Record<string, unknown> = { task, packId };

      if (input.facts && used + estimateTokens(input.facts) <= budget) {
        state.facts = input.facts;
        used += estimateTokens(input.facts);
      }

      const rules: string[] = [];
      for (const rule of input.rules ?? []) {
        const cost = estimateTokens(rule);
        if (used + cost > budget) break;
        rules.push(rule);
        used += cost;
      }
      if (rules.length > 0) state.rules = rules;

      const memoryEntries = await gatherMemory(memory, input);
      const selectedMemories: PrimerMemory[] = [];
      const memoryOut: PrimerMemory[] = [];
      let omittedMemories = 0;
      for (const entry of memoryEntries) {
        const cost = estimateTokens(entry);
        if (used + cost > budget) {
          omittedMemories += 1;
          continue;
        }
        memoryOut.push(entry);
        selectedMemories.push(entry);
        used += cost;
      }
      if (memoryOut.length > 0) state.memories = memoryOut;

      const candidateOut: PrimerCandidate[] = [];
      let omittedCandidates = 0;
      for (const candidate of input.candidates ?? []) {
        const cost = estimateTokens(candidate);
        if (used + cost > budget) {
          omittedCandidates += 1;
          continue;
        }
        candidateOut.push(candidate);
        used += cost;
      }
      if (candidateOut.length > 0) state.candidates = candidateOut;

      return {
        state: redactState(state),
        tokens: used,
        memories: selectedMemories,
        omittedMemories,
        omittedCandidates,
      };
    },
  };
}
