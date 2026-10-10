import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "./types";

// ─── Rules provider — deterministic, network-free fallback ───────────────────
//
// The provider-neutral contract has no generic deterministic classification
// (each pack's questions are semantic), so `rules` cannot invent answers: it
// returns an explicit `NoAnswer` for every question. That is intentional and
// safe — policy maps "no answer" to the pack's fail posture (protective packs
// fail closed, advisory packs proceed), and the registry uses this provider
// whenever a network provider is unconfigured or throws.
//
// It is pure and side-effect free, so it is safe to run on the hot path and
// inside every fallback branch.

export function createRulesProvider(): DecisionProvider {
  async function decide<T extends QuestionPack>(
    _state: State,
    questions: T,
  ): Promise<AnswerMap<T>> {
    const out: Record<string, Answer> = {};
    for (const id of Object.keys(questions)) {
      out[id] = { type: "no-answer", reason: "rules_fallback" };
    }
    return out as AnswerMap<T>;
  }

  return { name: "rules", decide };
}

export const rulesProvider: DecisionProvider = createRulesProvider();
