import { processMessage } from "@/lib/agent";
import { checkAndUpdateReprompt } from "./anti-loop";
import { detectInjection } from "./tools/prompt-security";
import type { SessionContext } from "./session-policy";
import logger from "@/lib/logger";

// ─── Fixed replies (sent without invoking the LLM) ───────────────────────────

export const FIXED_ACK_REPLY =
  "¡Gracias por tu mensaje! Si necesitás algo del negocio, escribinos.";
export const FIXED_CLARIFICATION_REPLY =
  "¿En qué puedo ayudarte? Podés consultar el catálogo, precios, delivery o el estado de tu pedido.";
export const HANDOFF_REPLY =
  "Te voy a conectar con un agente humano que puede ayudarte mejor. Un momento por favor.";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PendingMedia {
  type: "image" | "sticker" | "document";
  url: string;
  caption?: string;
}

// ─── Intent Classification ─────────────────────────────────────────────────────

function classifyIntent(text: string): string {
  const lower = text.toLowerCase().trim();
  if (!lower) return "other";

  if (
    /menú|menu|productos|catálogo|catalogo|qué tienen|qué venden|lista de precios|precios|cuánto cuesta|cuanto cuesta|promociones|ofertas|combo/i.test(
      lower,
    )
  ) {
    return "menu";
  }

  if (
    /pedido|orden|status|estado|seguimiento|cuándo llega|dónde está mi|preparado|listo para retirar/i.test(
      lower,
    )
  ) {
    return "status";
  }

  if (
    /gracias|ok|dale|s[ií]|confirmo|de acuerdo|perfecto|bueno|listo|si|simon/i.test(
      lower,
    )
  ) {
    return "confirm";
  }

  if (
    /hablar con (un )?humano|persona|agente|operador|transferir|humano|atornante|representante/i.test(
      lower,
    )
  ) {
    return "human";
  }

  if (
    /horarios|contacto|tel[eé]fono|dirección|ubicación|atienden|abren|dónde están|dónde queda|info/i.test(
      lower,
    )
  ) {
    return "info";
  }

  return "other";
}

// ─── Hallucination Guard ───────────────────────────────────────────────────────

const HALLUCINATION_DIRECTIVE =
  "Debés usar las herramientas disponibles para responder. No inventes información.";

const INTENT_MENU_KEYWORDS =
  /menú|menu|producto|catálogo|catalogo|precio|cuanto cuesta|qué tienen|promo|oferta|combo/i;

const INTENT_STATUS_KEYWORDS =
  /pedido|orden|status|estado|seguimiento|dónde está|cuándo llega|preparado|listo/i;

const INTENT_CONTACT_KEYWORDS =
  /horario|contacto|teléfono|dirección|ubicación|dónde están|atienden|abren/i;

const EVIDENCE_MENU_RESPONSE =
  /[$0-9.,]|catálogo|catalogo|productos|hamburguesa|pizza|lomito|pancho|combo|promo|oferta/i;

const EVIDENCE_STATUS_RESPONSE =
  /pedido|orden[#\s]?\d|estado|preparando|pendiente|listo|entregado|cancelado|en camino/i;

const EVIDENCE_CONTACT_RESPONSE =
  /horario|lunes|martes|mi[ée]rcoles|jueves|viernes|s[aá]bado|domingo|tel[eé]fono|whatsapp|dirección|ubicación/i;

function detectHallucination(
  userContent: string,
  responseText: string,
): boolean {
  const userLower = userContent.toLowerCase();
  const responseLower = responseText.toLowerCase();

  const askedForMenu = INTENT_MENU_KEYWORDS.test(userLower);
  const askedForOrderStatus = INTENT_STATUS_KEYWORDS.test(userLower);
  const askedForContact = INTENT_CONTACT_KEYWORDS.test(userLower);

  if (askedForMenu && !EVIDENCE_MENU_RESPONSE.test(responseLower)) return true;
  if (askedForOrderStatus && !EVIDENCE_STATUS_RESPONSE.test(responseLower))
    return true;
  if (askedForContact && !EVIDENCE_CONTACT_RESPONSE.test(responseLower))
    return true;

  return false;
}

// ─── Agent Orchestrator ────────────────────────────────────────────────────────

/**
 * High-level WhatsApp agent orchestrator.
 *
 * 1. Checks for prompt injection
 * 2. Runs anti-loop detection (escalation / force-response)
 * 3. Calls processMessage with conversation context
 * 4. Detects hallucination and retries once with a tool-forcing directive
 * 5. Saves the assistant response to the conversation
 * 6. Returns the response text and any pending media
 */
export async function runWhatsAppAgent({
  tenantId,
  conversationId,
  customerPhone,
  messages,
  sessionContext,
  routingKind,
}: {
  tenantId: number;
  conversationId: number;
  customerPhone: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  sessionContext?: SessionContext;
  routingKind?: string;
}): Promise<{ text: string; pendingMedia: PendingMedia[] }> {
  // ── a. Prompt injection check ──────────────────────────────────────────
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (lastUserMessage) {
    const injectionCheck = detectInjection(lastUserMessage.content);
    if (!injectionCheck.safe) {
      logger.warn(
        { reason: injectionCheck.reason },
        "[agent] Prompt injection detected",
      );
      return {
        text: "No puedo procesar esa solicitud. ¿En qué más puedo ayudarte?",
        pendingMedia: [],
      };
    }
  }

  // ── b. Anti-loop check ─────────────────────────────────────────────────
  const lastContent = lastUserMessage?.content ?? "";
  const currentIntent = classifyIntent(lastContent);

  const repromptResult = checkAndUpdateReprompt({}, currentIntent);

  // ── c. Escalation ──────────────────────────────────────────────────────
  if (repromptResult.shouldEscalate) {
    logger.warn(
      { conversationId },
      "[agent] Escalating to human after reprompt threshold",
    );
    return {
      text: "Te voy a conectar con un agente humano que puede ayudarte mejor. Un momento por favor.",
      pendingMedia: [],
    };
  }

  // ── d. Force-response directive ───────────────────────────────────────
  let forceText = lastContent;
  if (repromptResult.shouldForceResponse) {
    forceText = `${lastContent}\n\n(IMPORTANTE: Respondé directamente sin preguntar de nuevo. Tomá una decisión y actuá.)`;
  }

  // Build conversationHistory for processMessage:
  // - Include all messages except the latest user message (which becomes "text")
  // - Skip system messages (they are not part of processMessage's history type)
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let userIdx = 0;
  const totalUsers = messages.filter((m) => m.role === "user").length;
  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (msg.role === "user") {
      userIdx++;
      if (userIdx === totalUsers) continue; // last user message → becomes "text"
    }
    history.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // The durable session state crosses the LLM boundary only as compact
  // commercial facts — appended to the forced text, never as raw state.
  if (sessionContext || routingKind) {
    const hints: string[] = [];
    if (sessionContext?.hasActiveOrder) hints.push("el cliente tiene un pedido activo");
    if (sessionContext?.hasActiveCart) hints.push("el cliente tiene un carrito activo");
    if (sessionContext?.commercialIntent) hints.push(`intención previa: ${sessionContext.commercialIntent}`);
    if (hints.length) {
      forceText = `${forceText}\n\n(Contexto de sesión: ${hints.join("; ")}.)`;
    }
  }

  // ── e. Call processMessage ─────────────────────────────────────────────
  const rawText = await processMessage({
    tenantId,
    phoneNumber: customerPhone,
    text: forceText,
    conversationHistory: history,
  });

  // ── f. Hallucination guard (max 1 retry) ───────────────────────────────
  let text = rawText;

  if (detectHallucination(lastContent, rawText)) {
    logger.warn(
      { conversationId },
      "[agent] Hallucination detected, retrying once with tool directive",
    );

    text = await processMessage({
      tenantId,
      phoneNumber: customerPhone,
      text: `${HALLUCINATION_DIRECTIVE}\n\n${lastContent}`,
      conversationHistory: history,
    });
  }

  // ── g. Response persistence is owned by the inbound pipeline ───────────
  // (deliverReply inserts the assistant message with tenant scoping), so the
  // orchestrator only returns text + pending media.

  // ── h. Return result ───────────────────────────────────────────────────
  return { text, pendingMedia: [] };
}
