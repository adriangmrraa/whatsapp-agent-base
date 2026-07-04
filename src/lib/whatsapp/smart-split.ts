// ─── Smart Split ─────────────────────────────────────────────────────────────
// Split long messages into multiple WhatsApp-compatible chunks.
// WhatsApp has a ~4096 character limit per message for business APIs.

const DEFAULT_MAX_LENGTH = 4096;

/**
 * Split a long text into an array of chunks that fit within the given
 * maximum length. Splitting prefers sentence boundaries (period followed
 * by space, or newline) but falls back to forcing a split at maxLength
 * for unreasonably long words with no natural breaks.
 *
 * @param text      - The message to split.
 * @param maxLength - Maximum characters per chunk (default: 4096).
 * @returns An array of message chunks — always contains the original text
 *          wrapped in a single-element array if it fits within maxLength.
 */
export function splitMessage(text: string, maxLength: number = DEFAULT_MAX_LENGTH): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a sentence boundary (period + space, period + newline,
    // or just period at the end of a line) within the allowed length.
    let splitIndex = -1;

    // Prefer sentence-ending punctuation followed by space or newline
    const sentenceMatch = remaining.slice(0, maxLength).match(/.*?[.!?](?=\s|$)/g);
    if (sentenceMatch) {
      const lastSentence = sentenceMatch[sentenceMatch.length - 1];
      if (lastSentence.length <= maxLength && lastSentence.length > 0) {
        splitIndex = lastSentence.length;
      }
    }

    // If no sentence boundary found, try newline
    if (splitIndex === -1) {
      const newlineIndex = remaining.lastIndexOf("\n", maxLength - 1);
      if (newlineIndex > 0) {
        splitIndex = newlineIndex;
      }
    }

    // If no natural boundary found, try the last space within maxLength
    if (splitIndex === -1) {
      const spaceIndex = remaining.lastIndexOf(" ", maxLength - 1);
      if (spaceIndex > 0) {
        splitIndex = spaceIndex;
      }
    }

    // Fallback: force split at maxLength (handles long words with no breaks)
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}
