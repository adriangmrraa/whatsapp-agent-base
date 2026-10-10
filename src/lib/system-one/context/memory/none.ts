import type { MemoryProvider } from "./types";

// ─── None memory provider — stateless ────────────────────────────────────────
//
// Every method returns empty. Used when JEV_MEMORY=none (or on a deployment
// with no memory backend). Decisions become stateless but the primer still
// returns a valid `state` (task + rules + candidates only).

export function createNoneMemoryProvider(): MemoryProvider {
  return {
    name: "none",
    async search() {
      return [];
    },
    async get() {
      return "";
    },
    async save() {
      return "";
    },
    async context() {
      return "";
    },
  };
}

export const noneMemoryProvider: MemoryProvider = createNoneMemoryProvider();
