// Centralized model + provider defaults. Per-tenant overrides live in
// agent_config.ai_*; these env values are only the bootstrap fallback.

export const AI_BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/+$/, "") || "https://api.openai.com/v1";

export const AI_MODEL = process.env.AI_MODEL || "gpt-5-mini";
export const AI_MODEL_FAST = process.env.AI_MODEL_FAST || "gpt-5-nano";
export const AI_MODEL_VISION = process.env.AI_MODEL_VISION || "gpt-5-mini";
