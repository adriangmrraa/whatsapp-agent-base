-- ─── Hosted decision layer (System One) ─────────────────────────────────────
-- Adds the per-tenant decision_* config columns on agent_config: the hosted
-- Jev/Laya decision API key (AES-256 encrypted at rest), the base URL, and the
-- engine selector. All nullable → env fallback; unconfigured tenants keep the
-- local rules layer.
--
-- Hand-written: drizzle-kit custom migration (no TTY on Windows).

-- ─── Per-tenant hosted decision provider config (nullable → env fallback) ───
ALTER TABLE "agent_config" ADD COLUMN "decision_api_key" text;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "decision_base_url" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "decision_engine" varchar(50);--> statement-breakpoint
