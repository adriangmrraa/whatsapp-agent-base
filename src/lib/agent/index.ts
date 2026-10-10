import { generateText, stepCountIs } from "ai";
import { buildSystemPrompt, loadConfig, loadCatalog } from "./system-prompt";
import { buildAgentTools } from "./tools";
import { getMainChatModel } from "@/lib/ai/config";
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

    const systemPrompt = buildSystemPrompt(businessName, catalog, config);

    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: text },
    ];

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools: buildAgentTools(tenantId, phoneNumber),
      stopWhen: stepCountIs(3),
    });

    return result.text || FALLBACK_MESSAGE;
  } catch (error) {
    logger.error({ error, tenantId }, "[agent] Error processing message");
    return FALLBACK_MESSAGE;
  }
}
