-- ─── Multi-tenant migration ────────────────────────────────────────────────
-- Adds: tenants, channels, credentials, session state machine tables,
-- tenant_id on every business table, per-tenant agent config, Meta/Chatwoot
-- config columns. Backfills all existing rows into a "default" tenant.

-- New enums
CREATE TYPE "public"."tenant_status" AS ENUM('trial', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."channel_provider" AS ENUM('ycloud', 'meta', 'telegram', 'chatwoot');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_mode" AS ENUM('commercial', 'personal_acknowledged', 'handed_off');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_intent" AS ENUM('catalog', 'order', 'delivery', 'support', 'other');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_question" AS ENUM('unit_or_dozen', 'delivery_time', 'address', 'payment', 'other');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_asset_kind" AS ENUM('image', 'audio', 'document', 'video');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_event_type" AS ENUM('commercial_detected', 'personal_acknowledged', 'ambiguous_clarified', 'handoff_requested');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_signal" AS ENUM('commercial', 'personal', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."conversation_session_effect_kind" AS ENUM('human_override', 'owner_notification', 'customer_reply');--> statement-breakpoint

-- Extend existing enums
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'owner';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'instagram';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'messenger';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE IF NOT EXISTS 'chatwoot';--> statement-breakpoint

-- ─── New tables ────────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" "channel_provider" NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"key" varchar(100) NOT NULL,
	"value_encrypted" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_session_states" (
	"conversation_id" integer PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"episode" integer DEFAULT 0 NOT NULL,
	"mode" "conversation_session_mode" DEFAULT 'commercial' NOT NULL,
	"ack_sent" boolean DEFAULT false NOT NULL,
	"clarification_sent" boolean DEFAULT false NOT NULL,
	"commercial_intent" "conversation_session_intent",
	"pending_question" "conversation_session_question",
	"has_active_order" boolean DEFAULT false NOT NULL,
	"active_order_id" integer,
	"has_active_cart" boolean DEFAULT false NOT NULL,
	"has_address_reference" boolean DEFAULT false NOT NULL,
	"recent_asset_kinds" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_session_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"inbound_message_id" varchar(255) NOT NULL,
	"event_type" "conversation_session_event_type" NOT NULL,
	"signal" "conversation_session_signal" NOT NULL,
	"episode" integer DEFAULT 0 NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_session_effect_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"episode" integer NOT NULL,
	"effect_kind" "conversation_session_effect_kind" NOT NULL,
	"claimant" varchar(50) DEFAULT 'agent' NOT NULL,
	"inbound_message_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── Bootstrap tenant + backfill ───────────────────────────────────────────
INSERT INTO "tenants" ("slug", "name", "status")
VALUES ('default', 'Default Tenant', 'active')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- ─── tenant_id on every business table (nullable → backfill → NOT NULL) ────
ALTER TABLE "users" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "order_context_items" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint

UPDATE "users" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "conversations" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "chat_messages" SET "tenant_id" = (SELECT "tenant_id" FROM "conversations" WHERE "conversations"."id" = "chat_messages"."conversation_id") WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "chat_messages" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "leads" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "agent_config" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "products" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "orders" SET "tenant_id" = (SELECT "tenant_id" FROM "leads" WHERE "leads"."id" = "orders"."lead_id") WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "orders" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "order_context_items" SET "tenant_id" = (SELECT "tenant_id" FROM "conversations" WHERE "conversations"."id" = "order_context_items"."conversation_id") WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "order_context_items" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "addresses" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "attachments" SET "tenant_id" = (SELECT "tenant_id" FROM "leads" WHERE "leads"."id" = "attachments"."lead_id") WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "attachments" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "promotions" SET "tenant_id" = (SELECT id FROM "tenants" ORDER BY id LIMIT 1) WHERE "tenant_id" IS NULL;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_config" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_context_items" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

-- ─── Conversations: provider routing columns ───────────────────────────────
ALTER TABLE "conversations" ADD COLUMN "provider" varchar(50) DEFAULT 'ycloud' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_id" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "external_conversation_id" varchar(255);--> statement-breakpoint
-- Legacy embedded message log — chat_messages is the source of truth now.
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "messages";--> statement-breakpoint

-- ─── agent_config: AI provider + Meta + Chatwoot columns ───────────────────
-- Secrets move to the `credentials` table — drop the old plaintext columns.
ALTER TABLE "agent_config" DROP COLUMN IF EXISTS "ycloud_api_key";--> statement-breakpoint
ALTER TABLE "agent_config" DROP COLUMN IF EXISTS "meta_access_token";--> statement-breakpoint
ALTER TABLE "agent_config" DROP COLUMN IF EXISTS "meta_token_expires_at";--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "ai_api_key" text;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "ai_base_url" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "ai_model" varchar(100);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "ai_model_fast" varchar(100);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "ai_model_vision" varchar(100);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "meta_waba_id" varchar(50);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "chatwoot_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "chatwoot_base_url" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "chatwoot_account_id" integer;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "chatwoot_inbox_id" integer;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "chatwoot_mode" varchar(20) DEFAULT 'inbox';--> statement-breakpoint

-- ─── Re-key global uniques to tenant scope ─────────────────────────────────
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_whatsapp_id_unique";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_phone_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_messages_platform_id";--> statement-breakpoint

CREATE UNIQUE INDEX "idx_conversations_tenant_waid" ON "conversations" USING btree ("tenant_id", "whatsapp_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_leads_tenant_phone" ON "leads" USING btree ("tenant_id", "phone");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email_tenant" ON "users" USING btree ("email", "tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_messages_platform_id" ON "chat_messages" USING btree ("tenant_id", "platform_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_config_tenant" ON "agent_config" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_channels_provider_external" ON "channels" USING btree ("provider", "external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_credentials_tenant_key" ON "credentials" USING btree ("tenant_id", "provider", "key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_session_events_conv_inbound" ON "conversation_session_events" USING btree ("conversation_id", "inbound_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_session_effect_claim" ON "conversation_session_effect_claims" USING btree ("conversation_id", "episode", "effect_kind", "claimant");--> statement-breakpoint

CREATE INDEX "idx_channels_tenant" ON "channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_tenant" ON "conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_conv" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_leads_tenant" ON "leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_products_tenant" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_tenant" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_order_ctx_conv" ON "order_context_items" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_addresses_tenant" ON "addresses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_tenant" ON "attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_promotions_tenant" ON "promotions" USING btree ("tenant_id");--> statement-breakpoint

-- ─── Foreign keys ──────────────────────────────────────────────────────────
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_states" ADD CONSTRAINT "conversation_session_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_states" ADD CONSTRAINT "conversation_session_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_events" ADD CONSTRAINT "conversation_session_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_events" ADD CONSTRAINT "conversation_session_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_effect_claims" ADD CONSTRAINT "conversation_session_effect_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_session_effect_claims" ADD CONSTRAINT "conversation_session_effect_claims_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_context_items" ADD CONSTRAINT "order_context_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;