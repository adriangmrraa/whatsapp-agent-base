import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  numeric,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "viewer"]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trial",
  "active",
  "suspended",
]);

export const channelProviderEnum = pgEnum("channel_provider", [
  "ycloud",
  "meta",
  "telegram",
  "chatwoot",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "closed",
  "archived",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "converted",
  "lost",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
  "human",
]);

export const channelEnum = pgEnum("channel", [
  "whatsapp",
  "telegram",
  "instagram",
  "messenger",
  "chatwoot",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
]);

export const orderContextStatusEnum = pgEnum("order_context_status", [
  "active",
  "ordered",
]);

// Session state machine enums (persistent session policy)
export const sessionModeEnum = pgEnum("conversation_session_mode", [
  "commercial",
  "personal_acknowledged",
  "handed_off",
]);
export const sessionIntentEnum = pgEnum("conversation_session_intent", [
  "catalog",
  "order",
  "delivery",
  "support",
  "other",
]);
export const sessionQuestionEnum = pgEnum("conversation_session_question", [
  "unit_or_dozen",
  "delivery_time",
  "address",
  "payment",
  "other",
]);
export const sessionAssetKindEnum = pgEnum("conversation_session_asset_kind", [
  "image",
  "audio",
  "document",
  "video",
]);
export const sessionEventTypeEnum = pgEnum("conversation_session_event_type", [
  "commercial_detected",
  "personal_acknowledged",
  "ambiguous_clarified",
  "handoff_requested",
]);
export const sessionSignalEnum = pgEnum("conversation_session_signal", [
  "commercial",
  "personal",
  "ambiguous",
]);
export const sessionEffectKindEnum = pgEnum(
  "conversation_session_effect_kind",
  ["human_override", "owner_notification", "customer_reply"],
);

// ─── Tenancy ────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("trial"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Argentina/Buenos_Aires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Connected messaging channels per tenant. One row = one concrete channel:
 * a YCloud WhatsApp number, a Meta phone_number_id, a Telegram bot, a
 * Chatwoot inbox. Inbound webhooks resolve the tenant through
 * (provider, externalId).
 */
export const channels = pgTable(
  "channels",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: channelProviderEnum("provider").notNull(),
    /** Provider-side identity: business phone, phone_number_id, bot username, inbox id. */
    externalId: varchar("external_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    /** Provider-specific config (webhook token, WABA id, inbox id, extra ids). */
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    providerExternalUq: uniqueIndex("idx_channels_provider_external").on(
      table.provider,
      table.externalId,
    ),
    tenantIdx: index("idx_channels_tenant").on(table.tenantId),
  }),
);

/**
 * Encrypted per-tenant credentials. Replaces env-only secrets so each tenant
 * manages its own provider keys from the admin panel. Values are AES-256
 * encrypted at rest via ENCRYPTION_KEY.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Credential domain: "ycloud" | "meta" | "chatwoot" | "ai" | "telegram" | "app". */
    provider: varchar("provider", { length: 50 }).notNull(),
    /** Credential name: "api_key", "webhook_secret", "app_secret", "access_token"... */
    key: varchar("key", { length: 100 }).notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantKeyUq: uniqueIndex("idx_credentials_tenant_key").on(
      table.tenantId,
      table.provider,
      table.key,
    ),
  }),
);

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    hashedPassword: text("hashed_password").notNull(),
    name: varchar("name", { length: 255 }),
    role: userRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    emailTenantUq: uniqueIndex("idx_users_email_tenant").on(
      table.email,
      table.tenantId,
    ),
  }),
);

// ─── Conversations ──────────────────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** External customer identity (phone for WhatsApp, chat id for Telegram). */
    whatsappId: varchar("whatsapp_id", { length: 255 }).notNull(),
    customerName: varchar("customer_name", { length: 255 }),
    customerPhone: varchar("customer_phone", { length: 50 }),
    status: conversationStatusEnum("status").notNull().default("active"),
    /** Business channel family (what the customer sees). */
    channel: channelEnum("channel").notNull().default("whatsapp"),
    /** Provider that owns this conversation (ycloud | meta | chatwoot | telegram). */
    provider: varchar("provider", { length: 50 }).notNull().default("ycloud"),
    /** Channel row that routed this conversation (nullable for legacy rows). */
    channelId: integer("channel_id").references(() => channels.id),
    /** Provider-side conversation id (e.g. Chatwoot conversation id). */
    externalConversationId: varchar("external_conversation_id", { length: 255 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: varchar("last_message_preview", { length: 255 }),
    humanOverrideUntil: timestamp("human_override_until", { withTimezone: true }),
    externalUserId: varchar("external_user_id", { length: 255 }),
    conversationMetadata: jsonb("conversation_metadata")
      .$type<{
        repromptCount: number;
        lastUserIntent: string;
        lastSuggestedItems: string[];
        lastTools: string[];
      }>()
      .default({
        repromptCount: 0,
        lastUserIntent: "other",
        lastSuggestedItems: [],
        lastTools: [],
      }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantWhatsappUq: uniqueIndex("idx_conversations_tenant_waid").on(
      table.tenantId,
      table.whatsappId,
    ),
    tenantIdx: index("idx_conversations_tenant").on(table.tenantId),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    contentAttributes: jsonb("content_attributes")
      .$type<
        {
          type: "image" | "audio" | "document" | "video" | "location";
          url?: string;
          fileName?: string;
          fileSize?: number;
          mimeType?: string;
          caption?: string;
          transcription?: string;
          description?: string;
          latitude?: number;
          longitude?: number;
        }[]
      >()
      .default([]),
    platformMessageId: varchar("platform_message_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    platformMsgUq: uniqueIndex("idx_chat_messages_platform_id").on(
      table.tenantId,
      table.platformMessageId,
    ),
    convIdx: index("idx_chat_messages_conv").on(table.conversationId),
  }),
);

// ─── Session state machine (persistent, CAS-guarded) ────────────────────────

export const conversationSessionStates = pgTable(
  "conversation_session_states",
  {
    conversationId: integer("conversation_id")
      .primaryKey()
      .references(() => conversations.id),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    version: integer("version").notNull().default(0),
    policyVersion: integer("policy_version").notNull().default(1),
    episode: integer("episode").notNull().default(0),
    mode: sessionModeEnum("mode").notNull().default("commercial"),
    ackSent: boolean("ack_sent").notNull().default(false),
    clarificationSent: boolean("clarification_sent").notNull().default(false),
    commercialIntent: sessionIntentEnum("commercial_intent"),
    pendingQuestion: sessionQuestionEnum("pending_question"),
    hasActiveOrder: boolean("has_active_order").notNull().default(false),
    activeOrderId: integer("active_order_id"),
    hasActiveCart: boolean("has_active_cart").notNull().default(false),
    hasAddressReference: boolean("has_address_reference").notNull().default(false),
    recentAssetKinds: jsonb("recent_asset_kinds").$type<string[]>().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const conversationSessionEvents = pgTable(
  "conversation_session_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    inboundMessageId: varchar("inbound_message_id", { length: 255 }).notNull(),
    eventType: sessionEventTypeEnum("event_type").notNull(),
    signal: sessionSignalEnum("signal").notNull(),
    episode: integer("episode").notNull().default(0),
    stateVersion: integer("state_version").notNull().default(0),
    policyVersion: integer("policy_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    convInboundUq: uniqueIndex("idx_session_events_conv_inbound").on(
      table.conversationId,
      table.inboundMessageId,
    ),
  }),
);

export const conversationSessionEffectClaims = pgTable(
  "conversation_session_effect_claims",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    episode: integer("episode").notNull(),
    effectKind: sessionEffectKindEnum("effect_kind").notNull(),
    claimant: varchar("claimant", { length: 50 }).notNull().default("agent"),
    inboundMessageId: varchar("inbound_message_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    effectClaimUq: uniqueIndex("idx_session_effect_claim").on(
      table.conversationId,
      table.episode,
      table.effectKind,
      table.claimant,
    ),
  }),
);

// ─── CRM ────────────────────────────────────────────────────────────────────

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }),
    phone: varchar("phone", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    firstMessage: text("first_message"),
    refCode: varchar("ref_code", { length: 255 }),
    utmSource: varchar("utm_source", { length: 255 }),
    utmMedium: varchar("utm_medium", { length: 255 }),
    utmCampaign: varchar("utm_campaign", { length: 255 }),
    utmContent: varchar("utm_content", { length: 255 }),
    adId: varchar("ad_id", { length: 255 }),
    campaignId: varchar("campaign_id", { length: 255 }),
    adsetId: varchar("adset_id", { length: 255 }),
    platform: varchar("platform", { length: 100 }),
    notes: text("notes"),
    alias: varchar("alias", { length: 255 }),
    status: leadStatusEnum("status").notNull().default("new"),
    type: varchar("type", { length: 10 }),
    conversationId: integer("conversation_id").references(() => conversations.id),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantPhoneUq: uniqueIndex("idx_leads_tenant_phone").on(
      table.tenantId,
      table.phone,
    ),
    tenantIdx: index("idx_leads_tenant").on(table.tenantId),
  }),
);

// ─── Agent config (per tenant) ──────────────────────────────────────────────

export const agentConfig = pgTable(
  "agent_config",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    systemPrompt: text("system_prompt"),
    phoneNumber: varchar("phone_number", { length: 50 }),
    enabled: boolean("enabled").notNull().default(false),
    businessHours: jsonb("business_hours"),

    // ─── WhatsApp Bot ───────────────────────────────────────────────────
    whatsappBotNumber: varchar("whatsapp_bot_number", { length: 50 }),
    allowedPhoneIds: jsonb("allowed_phone_ids")
      .$type<{ name: string; phone: string }[]>()
      .default([]),
    sellerPhoneIds: jsonb("seller_phone_ids")
      .$type<{ name: string; phone: string }[]>()
      .default([]),
    autoReply24h: boolean("auto_reply_24h").notNull().default(false),
    autoReply24hMessage: text("auto_reply_24h_message"),
    trainBotContext: text("train_bot_context"),

    // ─── Telegram Bot ───────────────────────────────────────────────────
    telegramBotToken: text("telegram_bot_token"),
    telegramChatId: varchar("telegram_chat_id", { length: 50 }),
    telegramWebhookToken: varchar("telegram_webhook_token", { length: 100 }),
    telegramEnabled: boolean("telegram_enabled").notNull().default(false),

    // ─── WhatsApp Agent ─────────────────────────────────────────────────
    whatsappSystemPrompt: text("whatsapp_system_prompt"),
    whatsappInstructions: text("whatsapp_instructions"),
    whatsappPromotions: text("whatsapp_promotions"),

    // ─── AI Provider (agnostic — any OpenAI-compatible endpoint) ────────
    aiApiKey: text("ai_api_key"),
    aiBaseUrl: varchar("ai_base_url", { length: 255 }),
    aiModel: varchar("ai_model", { length: 100 }),
    aiModelFast: varchar("ai_model_fast", { length: 100 }),
    aiModelVision: varchar("ai_model_vision", { length: 100 }),

    // ─── Business Operations ────────────────────────────────────────────
    operatingHours: text("operating_hours"),
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryStartHour: varchar("delivery_start_hour", { length: 5 }),
    businessStartHour: varchar("business_start_hour", { length: 5 }).default(
      "20:00",
    ),
    deliveryZones: jsonb("delivery_zones")
      .$type<
        {
          zone: string;
          available: boolean;
          estimatedTime: string;
          cost: number;
        }[]
      >()
      .default([]),

    // ─── Business Status ────────────────────────────────────────────────
    isActive: boolean("is_active").notNull().default(true),
    outOfStock: boolean("out_of_stock").notNull().default(false),
    stockCount: integer("stock_count").default(0),
    primaryAlias: varchar("primary_alias", { length: 100 }),
    secondaryAlias: varchar("secondary_alias", { length: 100 }),
    estimatedWaitTime: varchar("estimated_wait_time", { length: 50 }),
    catalogImageUrls: jsonb("catalog_image_urls").$type<string[]>().default([]),

    // ─── Delivery Contact ───────────────────────────────────────────────
    deliveryPhoneNumber: varchar("delivery_phone_number", { length: 50 }),

    // ─── Meta Business ──────────────────────────────────────────────────
    metaBusinessName: varchar("meta_business_name", { length: 255 }),
    metaPhoneNumberId: varchar("meta_phone_number_id", { length: 50 }),
    metaWabaId: varchar("meta_waba_id", { length: 50 }),
    metaConnected: boolean("meta_connected").notNull().default(false),

    // ─── Chatwoot ───────────────────────────────────────────────────────
    chatwootEnabled: boolean("chatwoot_enabled").notNull().default(false),
    chatwootBaseUrl: varchar("chatwoot_base_url", { length: 255 }),
    chatwootAccountId: integer("chatwoot_account_id"),
    chatwootInboxId: integer("chatwoot_inbox_id"),
    /** "mirror" = watch only; "inbox" = human agents answer from Chatwoot. */
    chatwootMode: varchar("chatwoot_mode", { length: 20 }).default("inbox"),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantUq: uniqueIndex("idx_agent_config_tenant").on(table.tenantId),
  }),
);

// ─── Catalog / Sales ────────────────────────────────────────────────────────

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }),
    imageUrl: text("image_url"),
    category: varchar("category", { length: 100 }),
    line: varchar("line", { length: 100 }),
    available: boolean("available").notNull().default(true),
    comingSoon: boolean("coming_soon").notNull().default(false),
    stock: integer("stock"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPromo: boolean("is_promo").notNull().default(false),
    promoPrice: numeric("promo_price", { precision: 10, scale: 2 }),
    variants: jsonb("variants")
      .$type<
        {
          name: string;
          priceDelta: number;
          default?: boolean;
        }[]
      >()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_products_tenant").on(table.tenantId),
  }),
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    leadId: integer("lead_id").references(() => leads.id),
    phoneNumber: text("phone_number").notNull(),
    customerName: text("customer_name"),
    address: text("address"),
    orderType: varchar("order_type", { length: 100 }),
    items: jsonb("items").notNull(),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().default([]),
    status: orderStatusEnum("status").notNull().default("pending"),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default(
      "0",
    ),
    paymentStatus: text("payment_status").default("pending"),
    paymentMethod: text("payment_method"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    followupSent: boolean("followup_sent").notNull().default(false),
  },
  (table) => ({
    tenantIdx: index("idx_orders_tenant").on(table.tenantId),
  }),
);

export const orderContextItems = pgTable(
  "order_context_items",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    phone: text("phone").notNull(),
    productName: text("product_name").notNull(),
    productPrice: numeric("product_price", { precision: 10, scale: 2 }),
    quantity: integer("quantity").notNull().default(1),
    variant: text("variant"),
    notes: text("notes"),
    status: orderContextStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    convIdx: index("idx_order_ctx_conv").on(table.conversationId),
  }),
);

export const addresses = pgTable(
  "addresses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    latitude: text("latitude"),
    longitude: text("longitude"),
    mapsLink: text("maps_link"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_addresses_tenant").on(table.tenantId),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    leadId: integer("lead_id").references(() => leads.id),
    conversationId: integer("conversation_id").references(() => conversations.id),
    messageId: integer("message_id").references(() => chatMessages.id),
    type: varchar("type", { length: 20 }).notNull(),
    url: varchar("url", { length: 500 }).notNull(),
    fileName: varchar("file_name", { length: 255 }),
    mimeType: varchar("mime_type", { length: 100 }),
    fileSize: integer("file_size"),
    caption: varchar("caption", { length: 500 }),
    description: text("description"),
    documentType: varchar("document_type", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_attachments_tenant").on(table.tenantId),
  }),
);

export const promotions = pgTable(
  "promotions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    items: jsonb("items")
      .$type<{ productId: number; productName: string; quantity: number }[]>()
      .default([]),
    customPrice: numeric("custom_price", { precision: 10, scale: 2 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_promotions_tenant").on(table.tenantId),
  }),
);
