import type { PackDefinition } from "./types";

import { ambiguityPack } from "./ambiguity";
import { acceptancePack } from "./acceptance";
import { blastRadiusPack } from "./blast-radius";
import { contextPrimePack } from "./context-prime";
import { fileScopePack } from "./file-scope";
import { guardPack } from "./guard";
import { phaseRoutePack } from "./phase-route";
import { reviewPack } from "./review";
import { scopeGuardPack } from "./scope-guard";
import { skillRoutePack } from "./skill-route";
import { testImpactPack } from "./test-impact";
import { triagePack } from "./triage";
import { verifyPack } from "./verify";
import { workloadForecastPack } from "./workload-forecast";

// ─── JEV harness packs — the Phase 2 decision recipes ────────────────────────
//
// One recipe per file (questions + thresholds + pure run). This index is the
// single import surface for the SDD integration (Phase 5) and the MCP exposure
// (Phase 6): resolve a pack by id, or iterate the registry.

export * from "./types";

export * from "./context-prime";
export * from "./file-scope";
export * from "./test-impact";
export * from "./workload-forecast";
export * from "./guard";
export * from "./scope-guard";
export * from "./ambiguity";
export * from "./triage";
export * from "./acceptance";
export * from "./blast-radius";
export * from "./review";
export * from "./verify";
export * from "./skill-route";
export * from "./phase-route";

/** All packs, in the plan's catalog order. */
export const PACKS: readonly PackDefinition[] = [
  contextPrimePack,
  fileScopePack,
  skillRoutePack,
  workloadForecastPack,
  ambiguityPack,
  scopeGuardPack,
  testImpactPack,
  triagePack,
  acceptancePack,
  blastRadiusPack,
  reviewPack,
  verifyPack,
  phaseRoutePack,
  guardPack,
];

const PACK_BY_ID = new Map<string, PackDefinition>(
  PACKS.map((pack) => [pack.id, pack]),
);

/** Resolve a pack by id (undefined when unknown). */
export function getPack(id: string): PackDefinition | undefined {
  return PACK_BY_ID.get(id);
}

/**
 * The packs that fail CLOSED: with no usable signal they refuse to proceed.
 * Everything else is advisory (fail-open). Consumers use this to decide the
 * default posture when a decision is unavailable.
 */
export const CLOSED_PACK_IDS: readonly string[] = PACKS.filter(
  (pack) => pack.posture === "closed",
).map((pack) => pack.id);
