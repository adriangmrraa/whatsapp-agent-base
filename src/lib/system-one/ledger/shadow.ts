import type { MemoryProvider } from "../context/memory/types";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import {
  measureDecide,
  type DecideOutcome,
  type DecisionSample,
  type LedgerSink,
} from "./types";

// ─── Shadow ledger — run + log, change NOTHING ───────────────────────────────
//
// Shadow mode is the first adoption step (plan §7): a pack runs, its decision
// is measured and recorded, and the real code path is untouched. The guarantee
// is structural, not a convention:
//
//   - `runShadow` NEVER throws. A provider outage, a timeout, or a malformed
//     answer becomes a sample with `error` set and `answers: null`, so a shadow
//     decision can never block, redirect, or crash the caller.
//   - The returned `answers` are OBSERVATIONAL ONLY. Callers must not branch on
//     them; the live behavior keeps using the existing rules/policy. This is
//     what "must not alter behavior" means in code.
//
// A pack is promoted out of shadow only after the A/B gate (see ./ab.ts) shows
// it earns its keep; until then nothing downstream may read the shadow answers.

export interface ShadowResult<T extends QuestionPack> {
  /** The decision the provider WOULD have made. Do not act on this. */
  answers: AnswerMap<T> | null;
  sample: DecisionSample;
}

export interface RunShadowOptions {
  packId?: string;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
  /** Optional sink to collect the sample (e.g. a `ShadowLedger`). */
  sink?: LedgerSink;
}

/**
 * Run a provider against a pack for measurement only. Returns the candidate
 * answers plus a `DecisionSample`; never throws. Recording is best-effort and
 * isolated from the decision itself.
 */
export async function runShadow<T extends QuestionPack>(
  provider: DecisionProvider,
  state: State,
  questions: T,
  options: RunShadowOptions = {},
): Promise<ShadowResult<T>> {
  const outcome: DecideOutcome<T> = await measureDecide(provider, state, questions, {
    mode: "shadow",
    packId: options.packId,
    now: options.now,
  });
  options.sink?.record(outcome.sample);
  return { answers: outcome.answers, sample: outcome.sample };
}

/**
 * In-memory collector of shadow samples. Kept intentionally simple: the
 * harness decides when to flush it (and where — Engram for the dev harness,
 * never the product's tenant memory).
 */
export class ShadowLedger implements LedgerSink {
  private entries: DecisionSample[] = [];

  record(sample: DecisionSample): void {
    this.entries.push(sample);
  }

  all(): readonly DecisionSample[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Persist the collected samples to a memory backend under `topicKey`
   * (e.g. `sdd/<change>/decisions/<phase>`). Returns the backend id.
   */
  async persist(memory: MemoryProvider, topicKey: string): Promise<string> {
    return memory.save({
      title: `shadow ledger — ${this.entries.length} decision(s)`,
      topicKey,
      type: "discovery",
      content: JSON.stringify(this.entries, null, 2),
    });
  }
}
