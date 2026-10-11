// ─── JEV hooks — confidence bands ────────────────────────────────────────────
//
// The JavaScript mirror of `policy.ts` `DEFAULT_BANDS` / `BAND_OVERRIDES` /
// `bandsOf`. The Stop DONE hook uses these to turn a verify score into a stop
// decision; the guard pack uses the `flag` band as its read_only/local_edit
// confidence floor. Defaults are calibratable, not tuned (plan §7/§10).
//
//   score >= auto        → accept outright
//   flag <= score < auto → accept but flag for review
//   score < flag         → refuse
//
// Keep in sync with src/lib/system-one/policy.ts.

export const DEFAULT_BANDS = Object.freeze({ auto: 0.9, flag: 0.5 });

/** Per-label overrides; empty by default so every label inherits the defaults. */
export const BAND_OVERRIDES = Object.freeze({});

/** Bands for a label: defaults merged with any override; `auto >= flag >= 0`. */
export function bandsFor(label) {
  const override = BAND_OVERRIDES[label];
  const auto = Math.max(override?.auto ?? DEFAULT_BANDS.auto, 0);
  const flag = Math.max(override?.flag ?? DEFAULT_BANDS.flag, 0);
  return { auto, flag: Math.min(flag, auto) };
}
