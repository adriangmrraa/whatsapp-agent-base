"use client";

import { useActionState, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  Settings2,
  MessageSquare,
  Send,
  Bot,
  Briefcase,
  BarChart3,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AgentConfigData } from "./actions";
import { saveConfigAction } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────

type ConfigFormState = {
  // General
  systemPrompt: string;
  phoneNumber: string;
  enabled: boolean;

  // WhatsApp Bot
  whatsappBotNumber: string;
  allowedPhoneIds: string;
  sellerPhoneIds: string;
  autoReply24h: boolean;
  autoReply24hMessage: string;
  trainBotContext: string;

  // Telegram Bot
  telegramBotToken: string;
  telegramChatId: string;
  telegramWebhookToken: string;
  telegramEnabled: boolean;

  // WhatsApp Agent
  whatsappSystemPrompt: string;
  whatsappInstructions: string;
  whatsappPromotions: string;

  // Business Ops
  operatingHours: string;
  deliveryEnabled: boolean;
  deliveryStartHour: string;
  businessStartHour: string;
  deliveryZones: string;

  // Business Status
  isActive: boolean;
  outOfStock: boolean;
  stockCount: string;
  primaryAlias: string;
  secondaryAlias: string;
  estimatedWaitTime: string;
  catalogImageUrls: string;

  // AI Provider (OpenAI-compatible)
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  aiModelFast: string;
  aiModelVision: string;

  // Meta OAuth (token lives in `credentials` — only status is editable here)
  metaBusinessName: string;
  metaPhoneNumberId: string;
  metaWabaId: string;
  metaConnected: boolean;

  // Chatwoot
  chatwootEnabled: boolean;
  chatwootBaseUrl: string;
  chatwootAccountId: string;
  chatwootInboxId: string;
  chatwootMode: string;
};

function configToForm(config: AgentConfigData | null): ConfigFormState {
  return {
    // General
    systemPrompt: config?.systemPrompt ?? "",
    phoneNumber: config?.phoneNumber ?? "",
    enabled: config?.enabled ?? false,

    // WhatsApp Bot
    whatsappBotNumber: config?.whatsappBotNumber ?? "",
    allowedPhoneIds: JSON.stringify(config?.allowedPhoneIds ?? [], null, 2),
    sellerPhoneIds: JSON.stringify(config?.sellerPhoneIds ?? [], null, 2),
    autoReply24h: config?.autoReply24h ?? false,
    autoReply24hMessage: config?.autoReply24hMessage ?? "",
    trainBotContext: config?.trainBotContext ?? "",

    // Telegram Bot
    telegramBotToken: config?.telegramBotToken ?? "",
    telegramChatId: config?.telegramChatId ?? "",
    telegramWebhookToken: config?.telegramWebhookToken ?? "",
    telegramEnabled: config?.telegramEnabled ?? false,

    // WhatsApp Agent
    whatsappSystemPrompt: config?.whatsappSystemPrompt ?? "",
    whatsappInstructions: config?.whatsappInstructions ?? "",
    whatsappPromotions: config?.whatsappPromotions ?? "",

    // Business Ops
    operatingHours: config?.operatingHours ?? "",
    deliveryEnabled: config?.deliveryEnabled ?? true,
    deliveryStartHour: config?.deliveryStartHour ?? "",
    businessStartHour: config?.businessStartHour ?? "20:00",
    deliveryZones: JSON.stringify(config?.deliveryZones ?? [], null, 2),

    // Business Status
    isActive: config?.isActive ?? true,
    outOfStock: config?.outOfStock ?? false,
    stockCount: String(config?.stockCount ?? ""),
    primaryAlias: config?.primaryAlias ?? "",
    secondaryAlias: config?.secondaryAlias ?? "",
    estimatedWaitTime: config?.estimatedWaitTime ?? "",
    catalogImageUrls: JSON.stringify(config?.catalogImageUrls ?? [], null, 2),

    // AI Provider
    aiApiKey: config?.aiApiKey ?? "",
    aiBaseUrl: config?.aiBaseUrl ?? "",
    aiModel: config?.aiModel ?? "",
    aiModelFast: config?.aiModelFast ?? "",
    aiModelVision: config?.aiModelVision ?? "",

    // Meta OAuth
    metaBusinessName: config?.metaBusinessName ?? "",
    metaPhoneNumberId: config?.metaPhoneNumberId ?? "",
    metaWabaId: config?.metaWabaId ?? "",
    metaConnected: config?.metaConnected ?? false,

    // Chatwoot
    chatwootEnabled: config?.chatwootEnabled ?? false,
    chatwootBaseUrl: config?.chatwootBaseUrl ?? "",
    chatwootAccountId:
      config?.chatwootAccountId != null ? String(config.chatwootAccountId) : "",
    chatwootInboxId:
      config?.chatwootInboxId != null ? String(config.chatwootInboxId) : "",
    chatwootMode: config?.chatwootMode ?? "inbox",
  };
}

function formStateToDb(
  state: ConfigFormState,
): Record<string, unknown> {
  const parseJson = (val: string): unknown => {
    if (!val.trim()) return [];
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  return {
    // General
    ...(state.systemPrompt !== undefined && { systemPrompt: state.systemPrompt || null }),
    ...(state.phoneNumber !== undefined && { phoneNumber: state.phoneNumber || null }),
    enabled: state.enabled,

    // WhatsApp Bot
    ...(state.whatsappBotNumber !== undefined && {
      whatsappBotNumber: state.whatsappBotNumber || null,
    }),
    allowedPhoneIds: parseJson(state.allowedPhoneIds),
    sellerPhoneIds: parseJson(state.sellerPhoneIds),
    autoReply24h: state.autoReply24h,
    ...(state.autoReply24hMessage !== undefined && {
      autoReply24hMessage: state.autoReply24hMessage || null,
    }),
    ...(state.trainBotContext !== undefined && {
      trainBotContext: state.trainBotContext || null,
    }),

    // Telegram Bot
    ...(state.telegramBotToken !== undefined && {
      telegramBotToken: state.telegramBotToken || null,
    }),
    ...(state.telegramChatId !== undefined && {
      telegramChatId: state.telegramChatId || null,
    }),
    ...(state.telegramWebhookToken !== undefined && {
      telegramWebhookToken: state.telegramWebhookToken || null,
    }),
    telegramEnabled: state.telegramEnabled,

    // WhatsApp Agent
    ...(state.whatsappSystemPrompt !== undefined && {
      whatsappSystemPrompt: state.whatsappSystemPrompt || null,
    }),
    ...(state.whatsappInstructions !== undefined && {
      whatsappInstructions: state.whatsappInstructions || null,
    }),
    ...(state.whatsappPromotions !== undefined && {
      whatsappPromotions: state.whatsappPromotions || null,
    }),

    // Business Ops
    ...(state.operatingHours !== undefined && {
      operatingHours: state.operatingHours || null,
    }),
    deliveryEnabled: state.deliveryEnabled,
    ...(state.deliveryStartHour !== undefined && {
      deliveryStartHour: state.deliveryStartHour || null,
    }),
    ...(state.businessStartHour !== undefined && {
      businessStartHour: state.businessStartHour || null,
    }),
    deliveryZones: parseJson(state.deliveryZones),

    // Business Status
    isActive: state.isActive,
    outOfStock: state.outOfStock,
    stockCount: state.stockCount ? Number(state.stockCount) : null,
    ...(state.primaryAlias !== undefined && {
      primaryAlias: state.primaryAlias || null,
    }),
    ...(state.secondaryAlias !== undefined && {
      secondaryAlias: state.secondaryAlias || null,
    }),
    ...(state.estimatedWaitTime !== undefined && {
      estimatedWaitTime: state.estimatedWaitTime || null,
    }),
    catalogImageUrls: parseJson(state.catalogImageUrls),

    // AI Provider
    ...(state.aiApiKey !== undefined && {
      aiApiKey: state.aiApiKey || null,
    }),
    ...(state.aiBaseUrl !== undefined && {
      aiBaseUrl: state.aiBaseUrl || null,
    }),
    ...(state.aiModel !== undefined && { aiModel: state.aiModel || null }),
    ...(state.aiModelFast !== undefined && {
      aiModelFast: state.aiModelFast || null,
    }),
    ...(state.aiModelVision !== undefined && {
      aiModelVision: state.aiModelVision || null,
    }),

    // Meta OAuth (status fields only — tokens live in the credentials table)
    ...(state.metaBusinessName !== undefined && {
      metaBusinessName: state.metaBusinessName || null,
    }),
    ...(state.metaPhoneNumberId !== undefined && {
      metaPhoneNumberId: state.metaPhoneNumberId || null,
    }),
    ...(state.metaWabaId !== undefined && {
      metaWabaId: state.metaWabaId || null,
    }),

    // Chatwoot
    chatwootEnabled: state.chatwootEnabled,
    ...(state.chatwootBaseUrl !== undefined && {
      chatwootBaseUrl: state.chatwootBaseUrl || null,
    }),
    chatwootAccountId: state.chatwootAccountId
      ? Number(state.chatwootAccountId)
      : null,
    chatwootInboxId: state.chatwootInboxId ? Number(state.chatwootInboxId) : null,
    ...(state.chatwootMode !== undefined && {
      chatwootMode: state.chatwootMode || "inbox",
    }),
  };
}

// ─── Section Mapping ───────────────────────────────────────────────────────

interface SectionDef {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { key: "general", icon: <Settings2 className="size-4" />, title: "General", description: "Prompt del sistema, número de teléfono y estado del agente" },
  { key: "whatsapp-bot", icon: <MessageSquare className="size-4" />, title: "WhatsApp Bot", description: "Número, teléfonos permitidos, auto-reply y contexto" },
  { key: "telegram-bot", icon: <Send className="size-4" />, title: "Telegram Bot", description: "Token, chat ID y configuración del bot de Telegram" },
  { key: "whatsapp-agent", icon: <Bot className="size-4" />, title: "WhatsApp Agent", description: "Prompt, instrucciones y promociones del agente IA" },
  { key: "business-ops", icon: <Briefcase className="size-4" />, title: "Operaciones", description: "Horarios, delivery y zonas de entrega" },
  { key: "business-status", icon: <BarChart3 className="size-4" />, title: "Estado del Negocio", description: "Activo, stock, alias y URLs del catálogo" },
  { key: "ai-provider", icon: <Bot className="size-4" />, title: "AI Provider", description: "Proveedor OpenAI-compatible y modelos" },
  { key: "meta-oauth", icon: <Lock className="size-4" />, title: "Meta Business", description: "Conexión OAuth con Meta WhatsApp Business" },
  { key: "chatwoot", icon: <MessageSquare className="size-4" />, title: "Chatwoot", description: "Bandeja humana externa (opcional)" },
];

// ─── Field Helpers ─────────────────────────────────────────────────────────

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
        {label}
      </Label>
      {children}
    </div>
  );
}

// ─── Section Component ─────────────────────────────────────────────────────

function CollapsibleSection({
  section,
  isOpen,
  onToggle,
  children,
}: {
  section: SectionDef;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      {/* Clickable header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:opacity-80 transition-opacity text-left"
        style={{ borderBottom: isOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {section.icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.9)" }}>
              {section.title}
            </h3>
            <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
              {section.description}
            </p>
          </div>
        </div>
        <div className="shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-5 py-4 space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Client Component ─────────────────────────────────────────────────

interface AgentConfigClientProps {
  initialConfig: AgentConfigData | null;
}

export function AgentConfigClient({ initialConfig }: AgentConfigClientProps) {
  const [form, setForm] = useState<ConfigFormState>(() => configToForm(initialConfig));
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["general"]),
  );

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const updateField = useCallback(
    <K extends keyof ConfigFormState>(key: K, value: ConfigFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Save action via useActionState ──────────────────────────────────────

  const [saveResult, formAction, isPending] = useActionState(
    async (prev: { success: boolean; error?: string } | null) => {
      const current = formRef.current;
      const dbData = formStateToDb(current);
      const result = await saveConfigAction(dbData);

      if (result.success) {
        toast.success("Configuración guardada");
      } else {
        toast.error(result.error || "Error al guardar la configuración");
      }
      return result;
    },
    null,
  );

  const handleSave = useCallback(() => {
    formAction();
  }, [formAction]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
          Configuración del Agente
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          Administrá la configuración del agente IA, los canales y las operaciones del negocio
        </p>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <CollapsibleSection
            key={section.key}
            section={section}
            isOpen={openSections.has(section.key)}
            onToggle={() => toggleSection(section.key)}
          >
            {section.key === "general" && (
              <GeneralFields form={form} updateField={updateField} />
            )}
            {section.key === "whatsapp-bot" && (
              <WhatsAppBotFields form={form} updateField={updateField} />
            )}
            {section.key === "telegram-bot" && (
              <TelegramBotFields form={form} updateField={updateField} />
            )}
            {section.key === "whatsapp-agent" && (
              <WhatsAppAgentFields form={form} updateField={updateField} />
            )}
            {section.key === "business-ops" && (
              <BusinessOpsFields form={form} updateField={updateField} />
            )}
            {section.key === "business-status" && (
              <BusinessStatusFields form={form} updateField={updateField} />
            )}
            {section.key === "ai-provider" && (
              <AIProviderFields form={form} updateField={updateField} />
            )}
            {section.key === "meta-oauth" && (
              <MetaOAuthFields form={form} updateField={updateField} />
            )}
            {section.key === "chatwoot" && (
              <ChatwootFields form={form} updateField={updateField} />
            )}
          </CollapsibleSection>
        ))}
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2 pb-8">
        <Button
          onClick={handleSave}
          disabled={isPending}
          size="lg"
          className="gap-2 min-w-[180px]"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {isPending ? "Guardando\u2026" : "Guardar Configuración"}
        </Button>
      </div>

      {/* Server error after submission */}
      {saveResult && !saveResult.success && (
        <p className="text-sm text-red-400 text-center -mt-4">
          {saveResult.error}
        </p>
      )}
    </div>
  );
}

// ─── General Fields ────────────────────────────────────────────────────────

function GeneralFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <FieldRow label="System Prompt" htmlFor="systemPrompt">
        <Textarea
          id="systemPrompt"
          rows={5}
          value={form.systemPrompt}
          onChange={(e) => updateField("systemPrompt", e.target.value)}
          placeholder="Prompt base del agente..."
        />
      </FieldRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Número de Teléfono" htmlFor="phoneNumber">
          <Input
            id="phoneNumber"
            value={form.phoneNumber}
            onChange={(e) => updateField("phoneNumber", e.target.value)}
            placeholder="+5491123456789"
          />
        </FieldRow>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="enabled"
            checked={form.enabled}
            onCheckedChange={(v) => updateField("enabled", v)}
          />
          <Label htmlFor="enabled" className="cursor-pointer">Agente habilitado</Label>
        </div>
      </div>
    </>
  );
}

// ─── WhatsApp Bot Fields ───────────────────────────────────────────────────

function WhatsAppBotFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="WhatsApp Bot Number" htmlFor="whatsappBotNumber">
          <Input
            id="whatsappBotNumber"
            value={form.whatsappBotNumber}
            onChange={(e) => updateField("whatsappBotNumber", e.target.value)}
            placeholder="+5491123456789"
          />
        </FieldRow>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="autoReply24h"
            checked={form.autoReply24h}
            onCheckedChange={(v) => updateField("autoReply24h", v)}
          />
          <Label htmlFor="autoReply24h" className="cursor-pointer">Auto-reply 24h</Label>
        </div>
      </div>

      <FieldRow label="Allowed Phone IDs (JSON)" htmlFor="allowedPhoneIds">
        <Textarea
          id="allowedPhoneIds"
          rows={4}
          value={form.allowedPhoneIds}
          onChange={(e) => updateField("allowedPhoneIds", e.target.value)}
          placeholder='[{"name": "Ejemplo", "phone": "+5491123456789"}]'
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Seller Phone IDs (JSON)" htmlFor="sellerPhoneIds">
        <Textarea
          id="sellerPhoneIds"
          rows={4}
          value={form.sellerPhoneIds}
          onChange={(e) => updateField("sellerPhoneIds", e.target.value)}
          placeholder='[{"name": "Vendedor", "phone": "+5491123456789"}]'
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Auto-reply 24h Message" htmlFor="autoReply24hMessage">
        <Textarea
          id="autoReply24hMessage"
          rows={3}
          value={form.autoReply24hMessage}
          onChange={(e) => updateField("autoReply24hMessage", e.target.value)}
          placeholder="Mensaje de respuesta automática fuera del horario laboral..."
        />
      </FieldRow>

      <FieldRow label="Train Bot Context" htmlFor="trainBotContext">
        <Textarea
          id="trainBotContext"
          rows={5}
          value={form.trainBotContext}
          onChange={(e) => updateField("trainBotContext", e.target.value)}
          placeholder="Contexto adicional para entrenar al bot..."
        />
      </FieldRow>
    </>
  );
}

// ─── Telegram Bot Fields ───────────────────────────────────────────────────

function TelegramBotFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Telegram Bot Token" htmlFor="telegramBotToken">
          <Input
            id="telegramBotToken"
            value={form.telegramBotToken}
            onChange={(e) => updateField("telegramBotToken", e.target.value)}
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          />
        </FieldRow>

        <FieldRow label="Telegram Chat ID" htmlFor="telegramChatId">
          <Input
            id="telegramChatId"
            value={form.telegramChatId}
            onChange={(e) => updateField("telegramChatId", e.target.value)}
            placeholder="-1001234567890"
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Telegram Webhook Token" htmlFor="telegramWebhookToken">
          <Input
            id="telegramWebhookToken"
            value={form.telegramWebhookToken}
            onChange={(e) => updateField("telegramWebhookToken", e.target.value)}
            placeholder="webhook-secret-token"
          />
        </FieldRow>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="telegramEnabled"
            checked={form.telegramEnabled}
            onCheckedChange={(v) => updateField("telegramEnabled", v)}
          />
          <Label htmlFor="telegramEnabled" className="cursor-pointer">Telegram habilitado</Label>
        </div>
      </div>
    </>
  );
}

// ─── WhatsApp Agent Fields ─────────────────────────────────────────────────

function WhatsAppAgentFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <FieldRow label="WhatsApp System Prompt" htmlFor="whatsappSystemPrompt">
        <Textarea
          id="whatsappSystemPrompt"
          rows={5}
          value={form.whatsappSystemPrompt}
          onChange={(e) => updateField("whatsappSystemPrompt", e.target.value)}
          placeholder="Prompt específico para el agente de WhatsApp..."
        />
      </FieldRow>

      <FieldRow label="WhatsApp Instructions" htmlFor="whatsappInstructions">
        <Textarea
          id="whatsappInstructions"
          rows={5}
          value={form.whatsappInstructions}
          onChange={(e) => updateField("whatsappInstructions", e.target.value)}
          placeholder="Instrucciones detalladas para el agente..."
        />
      </FieldRow>

      <FieldRow label="WhatsApp Promotions" htmlFor="whatsappPromotions">
        <Textarea
          id="whatsappPromotions"
          rows={5}
          value={form.whatsappPromotions}
          onChange={(e) => updateField("whatsappPromotions", e.target.value)}
          placeholder="Promociones activas que el agente debe conocer..."
        />
      </FieldRow>
    </>
  );
}

// ─── Business Ops Fields ───────────────────────────────────────────────────

function BusinessOpsFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <FieldRow label="Operating Hours" htmlFor="operatingHours">
        <Textarea
          id="operatingHours"
          rows={3}
          value={form.operatingHours}
          onChange={(e) => updateField("operatingHours", e.target.value)}
          placeholder="Lunes a Viernes: 20:00 - 01:00&#10;Sábados: 20:00 - 02:00&#10;Domingos: Cerrado"
        />
      </FieldRow>

      <div className="flex items-center gap-3">
        <Switch
          id="deliveryEnabled"
          checked={form.deliveryEnabled}
          onCheckedChange={(v) => updateField("deliveryEnabled", v)}
        />
        <Label htmlFor="deliveryEnabled" className="cursor-pointer">Delivery habilitado</Label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Delivery Start Hour" htmlFor="deliveryStartHour">
          <Input
            id="deliveryStartHour"
            value={form.deliveryStartHour}
            onChange={(e) => updateField("deliveryStartHour", e.target.value)}
            placeholder="20:00"
          />
        </FieldRow>

        <FieldRow label="Business Start Hour" htmlFor="businessStartHour">
          <Input
            id="businessStartHour"
            value={form.businessStartHour}
            onChange={(e) => updateField("businessStartHour", e.target.value)}
            placeholder="20:00"
          />
        </FieldRow>
      </div>

      <FieldRow label="Delivery Zones (JSON)" htmlFor="deliveryZones">
        <Textarea
          id="deliveryZones"
          rows={5}
          value={form.deliveryZones}
          onChange={(e) => updateField("deliveryZones", e.target.value)}
          placeholder='[{"zone": "Centro", "available": true, "estimatedTime": "30 min", "cost": 500}]'
          className="font-mono text-xs"
        />
      </FieldRow>
    </>
  );
}

// ─── Business Status Fields ────────────────────────────────────────────────

function BusinessStatusFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            checked={form.isActive}
            onCheckedChange={(v) => updateField("isActive", v)}
          />
          <Label htmlFor="isActive" className="cursor-pointer">Negocio activo</Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="outOfStock"
            checked={form.outOfStock}
            onCheckedChange={(v) => updateField("outOfStock", v)}
          />
          <Label htmlFor="outOfStock" className="cursor-pointer">Sin stock</Label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Stock Count" htmlFor="stockCount">
          <Input
            id="stockCount"
            type="number"
            min={0}
            value={form.stockCount}
            onChange={(e) => updateField("stockCount", e.target.value)}
            placeholder="0"
          />
        </FieldRow>

        <FieldRow label="Estimated Wait Time" htmlFor="estimatedWaitTime">
          <Input
            id="estimatedWaitTime"
            value={form.estimatedWaitTime}
            onChange={(e) => updateField("estimatedWaitTime", e.target.value)}
            placeholder="30-45 min"
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Primary Alias" htmlFor="primaryAlias">
          <Input
            id="primaryAlias"
            value={form.primaryAlias}
            onChange={(e) => updateField("primaryAlias", e.target.value)}
            placeholder="Nombre principal del negocio"
          />
        </FieldRow>

        <FieldRow label="Secondary Alias" htmlFor="secondaryAlias">
          <Input
            id="secondaryAlias"
            value={form.secondaryAlias}
            onChange={(e) => updateField("secondaryAlias", e.target.value)}
            placeholder="Nombre secundario / abreviatura"
          />
        </FieldRow>
      </div>

      <FieldRow label="Catalog Image URLs (JSON)" htmlFor="catalogImageUrls">
        <Textarea
          id="catalogImageUrls"
          rows={4}
          value={form.catalogImageUrls}
          onChange={(e) => updateField("catalogImageUrls", e.target.value)}
          placeholder='["https://ejemplo.com/imagen1.jpg", "https://ejemplo.com/imagen2.jpg"]'
          className="font-mono text-xs"
        />
      </FieldRow>
    </>
  );
}

// ─── AI Provider Fields ────────────────────────────────────────────────────

function AIProviderFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <FieldRow label="API Key (OpenAI-compatible)" htmlFor="aiApiKey">
        <Input
          id="aiApiKey"
          type="password"
          value={form.aiApiKey}
          onChange={(e) => updateField("aiApiKey", e.target.value)}
          placeholder="sk-... (vacío = usa OPENAI_API_KEY del entorno)"
        />
      </FieldRow>

      <FieldRow label="Base URL" htmlFor="aiBaseUrl">
        <Input
          id="aiBaseUrl"
          value={form.aiBaseUrl}
          onChange={(e) => updateField("aiBaseUrl", e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </FieldRow>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <FieldRow label="Modelo principal" htmlFor="aiModel">
          <Input
            id="aiModel"
            value={form.aiModel}
            onChange={(e) => updateField("aiModel", e.target.value)}
            placeholder="gpt-5-mini"
          />
        </FieldRow>
        <FieldRow label="Modelo rápido" htmlFor="aiModelFast">
          <Input
            id="aiModelFast"
            value={form.aiModelFast}
            onChange={(e) => updateField("aiModelFast", e.target.value)}
            placeholder="gpt-5-nano"
          />
        </FieldRow>
        <FieldRow label="Modelo visión" htmlFor="aiModelVision">
          <Input
            id="aiModelVision"
            value={form.aiModelVision}
            onChange={(e) => updateField("aiModelVision", e.target.value)}
            placeholder="gpt-5-mini"
          />
        </FieldRow>
      </div>
    </>
  );
}

// ─── Meta Business (OAuth) ─────────────────────────────────────────────────

function MetaOAuthFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/meta/connect", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "No se pudo iniciar la conexión con Meta");
    } catch {
      toast.error("No se pudo iniciar la conexión con Meta");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Switch id="metaConnected" checked={form.metaConnected} disabled />
        <Label htmlFor="metaConnected" className="cursor-default">
          {form.metaConnected ? "Meta conectado" : "Meta no conectado"}
        </Label>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleConnect}
          disabled={connecting}
          className="w-fit gap-2"
        >
          {connecting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Lock className="size-4" />
          )}
          {form.metaConnected ? "Reconectar con Meta" : "Conectar con Meta"}
        </Button>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          El token se guarda cifrado en la base de datos — nunca se muestra acá.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Meta Business Name" htmlFor="metaBusinessName">
          <Input
            id="metaBusinessName"
            value={form.metaBusinessName}
            onChange={(e) => updateField("metaBusinessName", e.target.value)}
            placeholder="Mi Negocio"
          />
        </FieldRow>
        <FieldRow label="Meta Phone Number ID" htmlFor="metaPhoneNumberId">
          <Input
            id="metaPhoneNumberId"
            value={form.metaPhoneNumberId}
            onChange={(e) => updateField("metaPhoneNumberId", e.target.value)}
            placeholder="123456789012345"
          />
        </FieldRow>
      </div>

      <FieldRow label="WhatsApp Business Account ID" htmlFor="metaWabaId">
        <Input
          id="metaWabaId"
          value={form.metaWabaId}
          onChange={(e) => updateField("metaWabaId", e.target.value)}
          placeholder="98765432109876"
        />
      </FieldRow>
    </>
  );
}

// ─── Chatwoot Fields ───────────────────────────────────────────────────────

function ChatwootFields({
  form,
  updateField,
}: {
  form: ConfigFormState;
  updateField: <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Switch
          id="chatwootEnabled"
          checked={form.chatwootEnabled}
          onCheckedChange={(v) => updateField("chatwootEnabled", v)}
        />
        <Label htmlFor="chatwootEnabled" className="cursor-pointer">
          Chatwoot habilitado
        </Label>
      </div>

      <FieldRow label="Base URL" htmlFor="chatwootBaseUrl">
        <Input
          id="chatwootBaseUrl"
          value={form.chatwootBaseUrl}
          onChange={(e) => updateField("chatwootBaseUrl", e.target.value)}
          placeholder="https://app.chatwoot.com"
        />
      </FieldRow>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldRow label="Account ID" htmlFor="chatwootAccountId">
          <Input
            id="chatwootAccountId"
            value={form.chatwootAccountId}
            onChange={(e) => updateField("chatwootAccountId", e.target.value)}
            placeholder="1"
          />
        </FieldRow>
        <FieldRow label="Inbox ID" htmlFor="chatwootInboxId">
          <Input
            id="chatwootInboxId"
            value={form.chatwootInboxId}
            onChange={(e) => updateField("chatwootInboxId", e.target.value)}
            placeholder="2"
          />
        </FieldRow>
      </div>

      <FieldRow label="Modo" htmlFor="chatwootMode">
        <Input
          id="chatwootMode"
          value={form.chatwootMode}
          onChange={(e) => updateField("chatwootMode", e.target.value)}
          placeholder='inbox | mirror'
        />
      </FieldRow>

      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
        El API token de Chatwoot se configura en la sección de credenciales
        (tabla credentials, provider=&quot;chatwoot&quot;, key=&quot;api_token&quot;)
        o vía env CHATWOOT_API_TOKEN.
      </p>
    </>
  );
}
