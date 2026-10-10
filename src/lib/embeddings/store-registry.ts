import { PgVectorStore } from "./store";
import type { VectorStore } from "./types";

// ─── Vector store registry ───────────────────────────────────────────────────
//
// A single lazily-created store instance. Swapping pgvector for a hosted
// service means returning a different VectorStore here — nothing else changes.

let store: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!store) store = new PgVectorStore();
  return store;
}
