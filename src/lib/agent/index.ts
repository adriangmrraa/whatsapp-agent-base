import { generateText, stepCountIs } from "ai";
import { buildSystemPrompt, loadConfig, loadCatalog } from "./system-prompt";
import { buildAgentTools } from "./tools";
import { getMainChatModel } from "@/lib/ai/config";
import { retrieveKnowledge } from "@/lib/embeddings";
import { decideForTurn } from "@/lib/system-one";
import type { ModelMessage } from "ai";
import logger from "@/lib/logger";

const FALLBACK_MESSAGE =
  "Disculpá, hubo un problema de mi lado. Escribinos directamente y te atendemos a la brevedad 🙏";

export interface ProcessMessageOptions {
  tenantId: number;
  phoneNumber: string;
  text: string;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export async function processMessage({
  tenantId,
  phoneNumber,
  text,
  conversationHistory,
}: ProcessMessageOptions): Promise<string> {
  try {
    const [config, catalog, model] = await Promise.all([
      loadConfig(tenantId),
      loadCatalog(tenantId),
      getMainChatModel(tenantId),
    ]);

    const businessName =
      (config?.metaBusinessName as string) ?? "mi negocio";

    // Retrieve tenant knowledge before generating: inject only the relevant
    // top-k chunks into the prompt. Best-effort — empty context on failure.
    const knowledge = await retrieveKnowledge({ tenantId, query: text });

    // System One (Jev): deterministic decision consulted BEFORE the LLM. A
    // gate that disallows the turn suppresses the toolset (the model still
    // answers, without acting) — the customer handoff path is owned upstream
    // by the session policy.
    const decision = await decideForTurn({
      tenantId,
      surface: "customer",
      text,
    });
    logger.debug(
      { tenantId, decision: decision.choice ?? decision.kind, reason: decision.reason },
      "[agent] system-one decision",
    );

    const basePrompt = buildSystemPrompt(businessName, catalog, config);
    const systemPrompt = knowledge.context
      ? `${basePrompt}\n\n${knowledge.context}`
      : basePrompt;

    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: text },
    ];

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools: decision.allow === false ? undefined : buildAgentTools(tenantId, phoneNumber),
      stopWhen: stepCountIs(3),
    });

    return result.text || FALLBACK_MESSAGE;
  } catch (error) {
    logger.error({ error, tenantId }, "[agent] Error processing message");
    return FALLBACK_MESSAGE;
  }
}
