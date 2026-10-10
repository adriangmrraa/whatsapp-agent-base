-- ─── Storefront + pre-agent order capture ───────────────────────────────────
-- Adds the tenant-scoped public storefront identity fields, the web-order
-- redirect toggle, and the structured-order columns on `orders` (request
-- dedup, WEB:<ref> reference, server-computed total, source).
--
-- Hand-written: drizzle-kit custom migration (no TTY on Windows).

-- ─── agent_config: storefront identity + web-order config ───────────────────
ALTER TABLE "agent_config" ADD COLUMN "storefront_tagline" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "storefront_description" text;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "storefront_address" text;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "storefront_instagram" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "storefront_website" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "web_order_redirect_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "web_order_whatsapp_number" varchar(50);--> statement-breakpoint

-- ─── orders: structured web-order columns ───────────────────────────────────
ALTER TABLE "orders" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "web_ref" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" varchar(20) DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint

-- Idempotent checkout: one order per (tenant, requestId); NULLs stay distinct.
CREATE UNIQUE INDEX "idx_orders_tenant_request" ON "orders" USING btree ("tenant_id", "request_id");--> statement-breakpoint
-- Pre-agent lookup: resolve a structured order from its WEB:<ref>.
CREATE INDEX "idx_orders_tenant_webref" ON "orders" USING btree ("tenant_id", "web_ref");
