// ─── Prompt Security ─────────────────────────────────────────────────────────
// Detect prompt injection attempts in user messages.
// Checks both Spanish and English patterns used in common jailbreak attempts.

const INJECTION_PATTERNS_SPANISH = [
  /ignora.*instrucciones anteriores/i,
  /ignora.*reglas/i,
  /olvida.*instrucciones/i,
  /olvida.*reglas/i,
  /sos.*nuevo.*asistente/i,
  /eres.*un.*asistente.*nuevo/i,
  /actuar.*como.*nuevo/i,
  /nuevo.*prompt/i,
  /nuevas.*instrucciones/i,
  /cambiar.*personalidad/i,
  /ignorar.*reglas/i,
  /desactivar.*filtros/i,
  /ignora todo lo anterior/i,
  /a partir de ahora/i,
  /modo desarrollador/i,
  /developer mode/i,
];

const INJECTION_PATTERNS_ENGLISH = [
  /ignore.*previous.*instructions/i,
  /ignore.*all.*previous/i,
  /new.*prompt/i,
  /you are now/i,
  /you.*are.*now.*a/i,
  /act as.*different/i,
  /pretend.*to be/i,
  /override.*rules/i,
  /bypass.*safeguards/i,
  /system prompt/i,
  /jailbreak/i,
  /developer.*mode/i,
  /do not follow/i,
  /forget.*rules/i,
  /disregard.*previous/i,
];

/**
 * Result of a prompt injection check.
 */
export interface DetectionResult {
  safe: boolean;
  reason?: string;
}

/**
 * Check a user message for prompt injection patterns.
 * Returns `{ safe: false, reason: "..." }` if a known pattern is detected,
 * or `{ safe: true }` if the message appears clean.
 *
 * @param text - The user message to inspect.
 */
export function detectInjection(text: string): DetectionResult {
  if (!text) return { safe: true };

  // Check Spanish patterns
  for (const pattern of INJECTION_PATTERNS_SPANISH) {
    if (pattern.test(text)) {
      return {
        safe: false,
        reason: `Mensaje contiene patrón sospechoso: "${pattern.source}"`,
      };
    }
  }

  // Check English patterns
  for (const pattern of INJECTION_PATTERNS_ENGLISH) {
    if (pattern.test(text)) {
      return {
        safe: false,
        reason: `Message contains suspicious pattern: "${pattern.source}"`,
      };
    }
  }

  return { safe: true };
}
