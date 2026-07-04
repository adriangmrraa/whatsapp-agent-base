// ─── Anti-Loop ───────────────────────────────────────────────────────────────
// Pure functions to detect and manage conversational loops.
// No side effects — all state is passed in and returned as updated metadata.

export interface RepromptMetadata {
  repromptCount: number;
  lastUserIntent: string;
  lastSuggestedItems: string[];
  lastTools: string[];
}

export interface RepromptResult {
  /** True when the agent should stop asking and force a response or action. */
  shouldForceResponse: boolean;
  /** True when the issue should be escalated to a human. */
  shouldEscalate: boolean;
  /** Updated metadata to persist for the next check. */
  updatedMetadata: RepromptMetadata;
}

/**
 * Evaluate reprompt state and detect conversational loops.
 *
 * - If `currentIntent` differs from `lastUserIntent`, the reprompt counter
 *   resets to 0 (the conversation has shifted to a new topic).
 * - Otherwise the counter increments.
 * - At >= 3 reprompts: `shouldForceResponse` becomes true — the agent should
 *   stop cycling and commit to an action.
 * - At >= 5 reprompts: `shouldEscalate` becomes true — a human should step in.
 *
 * @param metadata       - Current reprompt state (e.g. from DB or session).
 * @param currentIntent  - The intent classification of the latest user message.
 * @returns A result object with decisions and updated metadata.
 */
export function checkAndUpdateReprompt(
  metadata: Partial<RepromptMetadata>,
  currentIntent?: string,
): RepromptResult {
  const lastIntent = metadata.lastUserIntent ?? "";
  const repromptCount = metadata.repromptCount ?? 0;
  const lastSuggestedItems = metadata.lastSuggestedItems ?? [];
  const lastTools = metadata.lastTools ?? [];

  // Determine whether the intent has shifted
  const intentChanged = currentIntent !== undefined && currentIntent !== lastIntent;
  const newRepromptCount = intentChanged ? 0 : repromptCount + 1;

  const updatedMetadata: RepromptMetadata = {
    repromptCount: newRepromptCount,
    lastUserIntent: currentIntent ?? lastIntent,
    lastSuggestedItems,
    lastTools,
  };

  return {
    shouldForceResponse: newRepromptCount >= 3,
    shouldEscalate: newRepromptCount >= 5,
    updatedMetadata,
  };
}
