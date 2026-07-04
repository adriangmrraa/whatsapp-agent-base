import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { buildSystemPrompt, loadConfig, loadCatalog } from "./system-prompt";
import {
  getBusinessHours,
  getCatalog,
  makeCreateOrder,
  getOrderStatus,
  searchCatalog,
  getProductDetails,
  checkDelivery,
  getBusinessInfo,
  makeSaveCustomerAddress,
  callHuman,
  sendProductImage,
  getActivePromotions,
  makeGetCustomerHistory,
  suggestProducts,
  makeAddToOrder,
} from "./tools";
import type { ModelMessage } from "ai";
import logger from "@/lib/logger";

const FALLBACK_MESSAGE =
  "Disculp\u00e1, hubo un problema de mi lado. Escribinos directamente y te atendemos a la brevedad \uD83D\uDE4F";

export interface ProcessMessageOptions {
  phoneNumber: string;
  text: string;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export async function processMessage({
  phoneNumber,
  text,
  conversationHistory,
}: ProcessMessageOptions): Promise<string> {
  try {
    const [config, catalog] = await Promise.all([
      loadConfig(),
      loadCatalog(),
    ]);

    const businessName =
      (config?.metaBusinessName as string) ?? "mi negocio";

    const systemPrompt = buildSystemPrompt(businessName, catalog, config);

    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: text },
    ];

    const result = await generateText({
      model: openai.chat("gpt-5-mini"),
      system: systemPrompt,
      messages,
      tools: {
        getBusinessHours,
        getCatalog,
        createOrder: makeCreateOrder(phoneNumber),
        getOrderStatus,
        searchCatalog,
        getProductDetails,
        checkDelivery,
        getBusinessInfo,
        saveCustomerAddress: makeSaveCustomerAddress(phoneNumber),
        callHuman,
        sendProductImage,
        getActivePromotions,
        getCustomerHistory: makeGetCustomerHistory(phoneNumber),
        suggestProducts,
        addToOrder: makeAddToOrder(phoneNumber),
      },
      stopWhen: stepCountIs(3),
    });

    return result.text || FALLBACK_MESSAGE;
  } catch (error) {
    logger.error({ error }, "[agent] Error processing message");
    return FALLBACK_MESSAGE;
  }
}
