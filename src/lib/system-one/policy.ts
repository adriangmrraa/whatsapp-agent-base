import { labelDegradation } from "./types";

// ─── Decision policy — the single source of truth for thresholds + posture ───
//
// Every JEV harness threshold lives HERE, keyed by label and typed by kind.
// The packs no longer hardcode numbers: they read them from this registry, so
// calibration (plan §7 step 5) is one edit in one place, and a pack can never
// silently diverge from the policy it is supposed to implement.
//
// Two hard invariants (plan §3.4 — "thresholds are per-type"):
//
//   1. KIND IS PART OF THE LOOKUP. `noul`, `choice` and `score` live in three
//      separate maps behind three separate accessors. A `noul` cutoff (an
//      ABSOLUTE probability of yes) is never reused as a `choice` margin (a
//      RELATIVE margin) or a `score` rubric index. Structural, not a convention.
//   2. A MISSING THRESHOLD FAILS CLOSED. Unknown label or unknown key throws
//      `PolicyError` — never a silent permissive default. Protective beats
//      permissive, always.
//
// Fail posture extends the existing `LABEL_DEGRADATION` registry in
// `./types.ts`: protective labels fail CLOSED (no signal ⇒ block), advisory
// labels fail OPEN. `postureOf` consults this registry first and falls back to
// `labelDegradation`, so the per-turn labels keep working and anything
// unregistered still defaults to closed.

export type FailPosture = "open" | "closed";

/** The three JEV primitives. The kind selects the threshold's meaning. */
export type ThresholdKind = "noul" | "choice" | "score";

/**
 * Confidence/score bands shared by the lifecycle hooks (Stop DONE, guard ask).
 * `auto` is the level at which an outcome is accepted outright; `flag` is the
 * level at which it is accepted but surfaced for review. Below `flag` the
 * outcome is refused. Bands are DEFAULTED per label and overridable — a
 * calibratable starting point, not a tuned value (plan §7/§10).
 */
export interface Bands {
  /** At/above this confidence the outcome is auto-accepted. Default 0.9. */
  auto: number;
  /** At/above this (and below `auto`) the outcome is accepted but flagged. Default 0.5. */
  flag: number;
}

/** The default bands every label inherits until calibrated (0.9 auto / 0.5 flag). */
export const DEFAULT_BANDS: Bands = Object.freeze({ auto: 0.9, flag: 0.5 });

/**
 * Per-label band overrides. Empty by default — every label inherits
 * `DEFAULT_BANDS`. Calibrate a single label here without touching any pack.
 */
export const BAND_OVERRIDES: Readonly<Record<string, Partial<Bands>>> =
  Object.freeze({});

export interface LabelPolicy {
  posture: FailPosture;
  /** ABSOLUTE probability-of-yes cutoffs (noul), each in [0, 1]. */
  noul: Readonly<Record<string, number>>;
  /** RELATIVE margins/confidence floors (choice), each in [0, 1]. */
  choice: Readonly<Record<string, number>>;
  /** Ordered-rubric indices (score); meaning is the pack's criteria array. */
  score: Readonly<Record<string, number>>;
}

/** Thrown on an unknown label or an unknown threshold key (fail closed). */
export class PolicyError extends Error {
  readonly label: string;
  readonly key: string;
  readonly kind: ThresholdKind | "posture";

  constructor(label: string, key: string, kind: ThresholdKind | "posture") {
    super(`no ${kind} policy for label "${label}" key "${key}"`);
    this.name = "PolicyError";
    this.label = label;
    this.key = key;
    this.kind = kind;
  }
}

const EMPTY: Readonly<Record<string, number>> = Object.freeze({});

/**
 * The registry. Runtime turn labels mirror `LABEL_DEGRADATION`; pack labels
 * mirror each pack's declared `posture`. Threshold keys are the pack-internal
 * names (documented, stable), kept free of any `Min`/`Warn` suffix so the kind
 * — not the name — carries the semantics.
 */
export const POLICY: Readonly<Record<string, LabelPolicy>> = Object.freeze({
  // ── per-turn runtime labels (mirror LABEL_DEGRADATION) ──────────────────
  intent: { posture: "open", noul: EMPTY, choice: EMPTY, score: EMPTY },
  "capability-group": { posture: "open", noul: EMPTY, choice: EMPTY, score: EMPTY },
  risk: { posture: "closed", noul: EMPTY, choice: EMPTY, score: EMPTY },
  role: { posture: "closed", noul: EMPTY, choice: EMPTY, score: EMPTY },
  escalation: { posture: "closed", noul: EMPTY, choice: EMPTY, score: EMPTY },

  // ── packs (plan §4) ─────────────────────────────────────────────────────
  "context-prime": {
    posture: "open",
    noul: { candidate: 0.5, coverage: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "file-scope": {
    posture: "open",
    noul: { file: 0.4, covered: 0.5 },
    // Choice is RELATIVE: the folder pick is the top option; the margin is how
    // much better it must be than the fallback to count as settled.
    choice: { folderMargin: 0 },
    score: EMPTY,
  },
  "skill-route": {
    posture: "open",
    noul: { skill: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "workload-forecast": {
    posture: "open",
    noul: { chained: 0.5, decision: 0.5 },
    choice: EMPTY,
    score: { sizeWarn: 3 },
  },
  ambiguity: {
    posture: "closed",
    noul: { ambiguous: 0.5, missingInfo: 0.5, contradictory: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "scope-guard": {
    posture: "closed",
    noul: { inScope: 0.5, newPaths: 0.5, unrelated: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "test-impact": {
    posture: "open",
    noul: { test: 0.4, regression: 0.6 },
    choice: EMPTY,
    score: EMPTY,
  },
  triage: {
    posture: "open",
    noul: { blocking: 0.5, rerunable: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  acceptance: {
    posture: "open",
    noul: { scenario: 0.5, complete: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "blast-radius": {
    posture: "open",
    noul: { dependents: 0.5, publicApi: 0.5 },
    choice: EMPTY,
    score: { radiusWarn: 2 },
  },
  review: {
    posture: "open",
    noul: { blocking: 0.5 },
    choice: EMPTY,
    score: { weakScore: 2 },
  },
  verify: {
    posture: "open",
    noul: { evidence: 0.5, matches: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  "phase-route": {
    posture: "open",
    noul: { ready: 0.6, blocked: 0.5 },
    choice: EMPTY,
    score: EMPTY,
  },
  guard: {
    posture: "closed",
    noul: { injection: 0.5, destructive: 0.5, exfiltration: 0.5, irreversible: 0.7 },
    choice: EMPTY,
    score: EMPTY,
  },
});

/** The registered labels, in registry order. */
export function policyLabels(): string[] {
  return Object.keys(POLICY);
}

/**
 * Fail posture for a label: the extended registry wins, then the existing
 * `LABEL_DEGRADATION`, and an unregistered label fails closed.
 */
export function postureOf(label: string): FailPosture {
  return POLICY[label]?.posture ?? labelDegradation(label);
}

function lookup(label: string, key: string, kind: ThresholdKind): number {
  const value = POLICY[label]?.[kind][key];
  if (value === undefined) throw new PolicyError(label, key, kind);
  return value;
}

/** ABSOLUTE noul cutoff (probability of yes). Throws when unregistered. */
export function noulThreshold(label: string, key: string): number {
  return lookup(label, key, "noul");
}

/** RELATIVE choice margin. Throws when unregistered. */
export function choiceMargin(label: string, key: string): number {
  return lookup(label, key, "choice");
}

/** Ordered-rubric score index. Throws when unregistered. */
export function scoreThreshold(label: string, key: string): number {
  return lookup(label, key, "score");
}

/**
 * The bands for a label: `DEFAULT_BANDS` ({auto: 0.9, flag: 0.5}) merged with
 * any `BAND_OVERRIDES[label]`. Unlike the kind thresholds, bands never throw —
 * they are defaults every label may use, and an unregistered label simply gets
 * the defaults. The returned `auto` is guaranteed >= `flag`.
 */
export function bandsOf(label: string): Bands {
  const override = BAND_OVERRIDES[label];
  const auto = Math.max(override?.auto ?? DEFAULT_BANDS.auto, 0);
  const flag = Math.max(override?.flag ?? DEFAULT_BANDS.flag, 0);
  return { auto, flag: Math.min(flag, auto) };
}
