// ─── Text chunker ────────────────────────────────────────────────────────────
//
// Deterministic, dependency-free chunking. Splits on paragraph boundaries
// first, then sentences, then words — never mid-word — with a small overlap so
// a fact that straddles a boundary is still retrievable.

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters carried from the previous chunk into the next one. */
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = { maxChars: 1200, overlapChars: 150 };

/** Rough token estimate (~4 chars/token) for cost/telemetry only. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hardSplitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Split text into chunks of at most `maxChars`, preferring paragraph then
 * sentence boundaries, with `overlapChars` of context carried forward.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars, overlapChars } = { ...DEFAULTS, ...options };
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Expand every paragraph into units no larger than maxChars.
  const units: string[] = [];
  for (const paragraph of normalized.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      units.push(trimmed);
      continue;
    }
    let buffer = "";
    for (const sentence of splitSentences(trimmed)) {
      if (sentence.length > maxChars) {
        if (buffer) {
          units.push(buffer);
          buffer = "";
        }
        units.push(...hardSplitByWords(sentence, maxChars));
        continue;
      }
      if (buffer.length + 1 + sentence.length <= maxChars) {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      } else {
        if (buffer) units.push(buffer);
        buffer = sentence;
      }
    }
    if (buffer) units.push(buffer);
  }

  // Merge small units, carrying overlap into the next chunk.
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    if (current.length + 2 + unit.length <= maxChars) {
      current = `${current}\n\n${unit}`;
    } else {
      chunks.push(current);
      const overlap = current.slice(-overlapChars);
      current = `${overlap}\n\n${unit}`;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
