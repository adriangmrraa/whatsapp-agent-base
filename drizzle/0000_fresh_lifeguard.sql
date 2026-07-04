CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system', 'human');--> statement-breakpoint
CREATE TYPE "public"."order_context_status" AS ENUM('active', 'ordered');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'preparing', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"latitude" text,
	"longitude" text,
	"maps_link" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"system_prompt" text,
	"phone_number" varchar(50),
	"ycloud_api_key" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"business_hours" jsonb,
	"whatsapp_bot_number" varchar(50),
	"allowed_phone_ids" jsonb DEFAULT '[]'::jsonb,
	"seller_phone_ids" jsonb DEFAULT '[]'::jsonb,
	"auto_reply_24h" boolean DEFAULT false NOT NULL,
	"auto_reply_24h_message" text,
	"train_bot_context" text,
	"telegram_bot_token" text,
	"telegram_chat_id" varchar(50),
	"telegram_webhook_token" varchar(100),
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_system_prompt" text,
	"whatsapp_instructions" text,
	"whatsapp_promotions" text,
	"operating_hours" text,
	"delivery_enabled" boolean DEFAULT true NOT NULL,
	"delivery_start_hour" varchar(5),
	"business_start_hour" varchar(5) DEFAULT '20:00',
	"delivery_zones" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"out_of_stock" boolean DEFAULT false NOT NULL,
	"stock_count" integer DEFAULT 0,
	"primary_alias" varchar(100),
	"secondary_alias" varchar(100),
	"estimated_wait_time" varchar(50),
	"catalog_image_urls" jsonb DEFAULT '[]'::jsonb,
	"delivery_phone_number" varchar(50),
	"meta_access_token" text,
	"meta_token_expires_at" timestamp with time zone,
	"meta_business_name" varchar(255),
	"meta_phone_number_id" varchar(50),
	"meta_connected" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"conversation_id" integer,
	"message_id" integer,
	"type" varchar(20) NOT NULL,
	"url" varchar(500) NOT NULL,
	"file_name" varchar(255),
	"mime_type" varchar(100),
	"file_size" integer,
	"caption" varchar(500),
	"description" text,
	"document_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"content_attributes" jsonb DEFAULT '[]'::jsonb,
	"platform_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"whatsapp_id" varchar(255) NOT NULL,
	"customer_name" varchar(255),
	"customer_phone" varchar(50),
	"messages" jsonb DEFAULT '[]'::jsonb,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"channel" "channel" DEFAULT 'whatsapp' NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_preview" varchar(255),
	"human_override_until" timestamp with time zone,
	"external_user_id" varchar(255),
	"conversation_metadata" jsonb DEFAULT '{"repromptCount":0,"lastUserIntent":"other","lastSuggestedItems":[],"lastTools":[]}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_whatsapp_id_unique" UNIQUE("whatsapp_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"phone" varchar(50) NOT NULL,
	"email" varchar(255),
	"address" text,
	"first_message" text,
	"ref_code" varchar(255),
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"ad_id" varchar(255),
	"campaign_id" varchar(255),
	"adset_id" varchar(255),
	"platform" varchar(100),
	"notes" text,
	"alias" varchar(255),
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"type" varchar(10),
	"conversation_id" integer,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leads_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "order_context_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"phone" text NOT NULL,
	"product_name" text NOT NULL,
	"product_price" numeric(10, 2),
	"quantity" integer DEFAULT 1 NOT NULL,
	"variant" text,
	"notes" text,
	"status" "order_context_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"phone_number" text NOT NULL,
	"customer_name" text,
	"address" text,
	"order_type" varchar(100),
	"items" jsonb NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0',
	"payment_status" text DEFAULT 'pending',
	"payment_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"followup_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"image_url" text,
	"category" varchar(100),
	"line" varchar(100),
	"available" boolean DEFAULT true NOT NULL,
	"coming_soon" boolean DEFAULT false NOT NULL,
	"stock" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_promo" boolean DEFAULT false NOT NULL,
	"promo_price" numeric(10, 2),
	"variants" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"items" jsonb DEFAULT '[]'::jsonb,
	"custom_price" numeric(10, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"hashed_password" text NOT NULL,
	"name" varchar(255),
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_context_items" ADD CONSTRAINT "order_context_items_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_messages_platform_id" ON "chat_messages" USING btree ("platform_message_id");