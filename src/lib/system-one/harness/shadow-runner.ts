import type { ContextPrimer } from "../context/primer";
import type { MemoryProvider } from "../context/memory/types";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import { getPack } from "../packs";
import {
  noAnswerMap,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "../packs/types";
import { measureDecide, type DecisionSample } from "../ledger/types";

// ─── Shadow runner — SDD packs, observe-only (plan §5 + §7) ──────────────────
//
// Runs a named SDD pack the way the phases need it while honoring the shadow
// contract structurally:
//
//   - It measures every provider call with `measureDecide` (mode "shadow") and
//     collects a `DecisionSample` per call.
//   - It persists the pack decision + samples to memory (`MemoryProvider.save`)
//     under `sdd/<change>/decisions/<phase>` so every decision is auditable and
//     replayable (plan §5, §2).
//   - It NEVER acts on `result.allow`. The returned `payload.acted` is always
//     `false`; promotion out of shadow happens only through the ledger gate.
//   - It never throws on a provider outage: `measureDecide` isolates the error
//     into the sample, and the pack's fail posture maps the no-answer.
//
// Dependencies are injected (`provider`, `primer`, `memory`) so this module is
// pure and unit-testable; the CLI in `harness/sdd/` wires the real ones.

export interface ShadowRunContext {
  change: string;
  phase: string;
}

export interface ShadowDecisionPayload {
  change: string;
  phase: string;
  packId: string;
  mode: "shadow";
  acted: false;
  provider: string;
  posture: string;
  allow: boolean;
  degraded: boolean;
  reason: string;
  tokens: number;
  value: unknown;
  samples: DecisionSample[];
  at: number;
}

export interface ShadowPackRun {
  packId: string;
  change: string;
  phase: string;
  topicKey: string;
  result: PackResult<unknown>;
  samples: DecisionSample[];
  payload: ShadowDecisionPayload;
  /** Backend id when persisted; null when memory was unavailable. */
  persistedId: string | null;
}

export interface ShadowRunnerDeps {
  provider: DecisionProvider;
  primer: ContextPrimer;
  memory: MemoryProvider;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
  project?: string;
}

export interface ShadowRunner {
  run(
    packId: string,
    input: PackInput,
    ctx: ShadowRunContext,
  ): Promise<ShadowPackRun>;
}

/** Engram topic key for a decision: `sdd/<change>/decisions/<phase>`. */
export function decisionTopicKey(change: string, phase: string): string {
  return `sdd/${change}/decisions/${phase}`;
}

/**
 * A provider that measures each decision into `samples` while returning the
 * answers unchanged. On a provider error it yields an all-`no-answer` map so the
 * pack's fail posture decides — mirroring `askPack` without throwing.
 */
function measuringProvider(
  provider: DecisionProvider,
  packId: string,
  samples: DecisionSample[],
  now: (() => number) | undefined,
): DecisionProvider {
  return {
    name: provider.name,
    async decide<T extends QuestionPack>(
      state: State,
      questions: T,
    ): Promise<AnswerMap<T>> {
      const outcome = await measureDecide(provider, state, questions, {
        mode: "shadow",
        packId,
        now,
      });
      samples.push(outcome.sample);
      return outcome.answers ?? noAnswerMap(questions);
    },
  };
}

export function createShadowRunner(deps: ShadowRunnerDeps): ShadowRunner {
  return {
    async run(
      packId: string,
      input: PackInput,
      ctx: ShadowRunContext,
    ): Promise<ShadowPackRun> {
      const pack = getPack(packId);
      if (!pack) throw new Error(`unknown pack: ${packId}`);

      const samples: DecisionSample[] = [];
      const runtime: PackRuntime = {
        primer: deps.primer,
        provider: measuringProvider(deps.provider, packId, samples, deps.now),
      };
      const result = await pack.run(input, runtime);

      const topicKey = decisionTopicKey(ctx.change, ctx.phase);
      const payload: ShadowDecisionPayload = {
        change: ctx.change,
        phase: ctx.phase,
        packId,
        mode: "shadow",
        acted: false,
        provider: result.provider,
        posture: result.posture,
        allow: result.allow,
        degraded: result.degraded,
        reason: result.reason,
        tokens: result.tokens,
        value: result.value,
        samples,
        at: (deps.now ?? Date.now)(),
      };

      let persistedId: string | null = null;
      try {
        const id = await deps.memory.save({
          title: topicKey,
          topicKey,
          type: "discovery",
          content: JSON.stringify(payload, null, 2),
        });
        persistedId = id || null;
      } catch {
        persistedId = null;
      }

      return { packId, change: ctx.change, phase: ctx.phase, topicKey, result, samples, payload, persistedId };
    },
  };
}
