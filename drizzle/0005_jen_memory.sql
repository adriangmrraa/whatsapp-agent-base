-- ─── JEV harness memory (tenant-scoped, portable fallback) ───────────────────
-- Adds `jen_memory`: the `neon` MemoryProvider backend
-- (src/lib/system-one/context/memory/neon.ts). One row = one observation for a
-- (tenant, project) namespace. Every query filters BOTH tenant_id (isolation
-- law) and project (harness namespace).
--
-- Hand-written: drizzle-kit custom migration (no TTY on Windows).
-- Note: schema snapshots in drizzle/meta are not maintained for newer tables
-- (see 0002_knowledge_chunks); migrations are the source of truth.

CREATE TABLE "jen_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"project" varchar(255) NOT NULL,
	"topic_key" varchar(255),
	"type" varchar(50) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jen_memory" ADD CONSTRAINT "jen_memory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jen_memory_project" ON "jen_memory" USING btree ("project");--> statement-breakpoint
CREATE INDEX "idx_jen_memory_tenant" ON "jen_memory" USING btree ("tenant_id");
