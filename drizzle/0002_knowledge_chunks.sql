-- ─── Embeddings & vector memory ─────────────────────────────────────────────
-- Adds the tenant-scoped knowledge_chunks table (pgvector) and the per-tenant
-- embedding_* config columns on agent_config. Requites the `vector` extension
-- (Neon supports it natively; local Postgres: `CREATE EXTENSION vector`).
--
-- Hand-written: drizzle-kit custom migration (no TTY on Windows).

-- pgvector extension (nearest-neighbour search). Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- ─── Per-tenant embedding provider config (nullable → env fallback) ─────────
ALTER TABLE "agent_config" ADD COLUMN "embedding_api_key" text;--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "embedding_base_url" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "embedding_model" varchar(100);--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint

-- ─── knowledge_chunks ───────────────────────────────────────────────────────
CREATE TABLE "knowledge_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"document_key" varchar(255) NOT NULL,
	"source" varchar(100) NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"token_count" integer,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" varchar(100) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Idempotent re-ingest: identical content for the same document is a no-op.
CREATE UNIQUE INDEX "idx_knowledge_chunks_tenant_doc_hash" ON "knowledge_chunks" USING btree ("tenant_id", "document_key", "content_hash");--> statement-breakpoint
-- Every query filters the tenant first — the isolation boundary.
CREATE INDEX "idx_knowledge_chunks_tenant" ON "knowledge_chunks" USING btree ("tenant_id");--> statement-breakpoint
-- Approximate nearest-neighbour over cosine distance.
CREATE INDEX "idx_knowledge_chunks_embedding" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
