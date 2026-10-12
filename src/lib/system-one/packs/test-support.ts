import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
} from "../provider/types";
import type { ContextPrimer, PrimerResult } from "../context/primer";
import type { PackRuntime } from "./types";

// ─── Test support for pack fixtures ──────────────────────────────────────────
//
// Packs are pure over { primer, provider }, so a fixture only needs a canned
// primer (echoes the task, no memory) and a canned provider (a map of typed
// answers). Tests also use a "no-signal" provider to assert fail posture.

export function fakePrimer(): ContextPrimer {
  return {
    async build(packId, input): Promise<PrimerResult> {
      return {
        state: { task: input.task, packId },
        tokens: 1,
        memories: [],
        omittedMemories: 0,
        omittedCandidates: 0,
      };
    },
  };
}

/** A provider that returns exactly the answers in `map`, no-answer otherwise. */
export function fakeProvider(map: Record<string, Answer>): DecisionProvider {
  return {
    name: "fake",
    async decide<T extends QuestionPack>(
      _state: unknown,
      questions: T,
    ): Promise<AnswerMap<T>> {
      const out: Record<string, Answer> = {};
      for (const id of Object.keys(questions)) {
        out[id] = map[id] ?? { type: "no-answer", reason: "missing" };
      }
      return out as AnswerMap<T>;
    },
  };
}

/** A provider that declines every question (models an unavailable provider). */
export const noSignalProvider: DecisionProvider = {
  name: "no-signal",
  async decide<T extends QuestionPack>(
    _state: unknown,
    questions: T,
  ): Promise<AnswerMap<T>> {
    const out: Record<string, Answer> = {};
    for (const id of Object.keys(questions)) {
      out[id] = { type: "no-answer", reason: "test-no-signal" };
    }
    return out as AnswerMap<T>;
  },
};

export function runtime(provider: DecisionProvider): PackRuntime {
  return { primer: fakePrimer(), provider };
}

export const noul = (value: number): Answer => ({ type: "noul", noul: value });
export const choice = (value: string, confidence?: number): Answer => ({
  type: "choice",
  choice: value,
  ...(confidence === undefined ? {} : { confidence }),
});
export const score = (value: number): Answer => ({ type: "score", score: value });
