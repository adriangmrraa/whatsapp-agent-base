-- ─── jen_memory: nullable tenant scope (harness/global) ──────────────────────
-- The product always sets tenant_id (isolation law); the dev harness runs with
-- NO tenant, so NULL becomes the harness/global scope. Queries then filter
-- `tenant_id IS NULL` (never an unscoped query), so product rows can never leak.
--
-- Hand-written: drizzle-kit custom migration (no TTY on Windows).

ALTER TABLE "jen_memory" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_jen_memory_harness_scope" ON "jen_memory" USING btree ("project") WHERE "tenant_id" IS NULL;
