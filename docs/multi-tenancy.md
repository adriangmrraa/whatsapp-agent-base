# Multi-tenancy

Tenant isolation is a **security boundary**, not a filter you remember to add.
This document defines the model and the rules every code path must follow.

## The model

- `tenants` — id, slug, name, status (`trial|active|suspended`), timezone.
- `channels` — `(provider, external_id)` → `tenant_id`. One row per concrete
  endpoint: a YCloud business number, a Meta `phone_number_id`, a Chatwoot
  inbox, a Telegram bot username.
- `credentials` — `(tenant_id, provider, key)` → AES-256 value.
- `users` — belong to exactly one tenant; unique on `(email, tenant_id)`.
- Every business table carries `tenant_id NOT NULL REFERENCES tenants(id)`:
  conversations, chat_messages, leads, agent_config, products, orders,
  order_context_items, addresses, attachments, promotions, session tables.
- Global uniques are **re-keyed to tenant scope**: conversation identity is
  `(tenant_id, whatsapp_id)`, lead identity is `(tenant_id, phone)`, message
  dedup is `(tenant_id, platform_message_id)`.

## Tenant resolution — two entry points

### Inbound (webhooks)

```
provider + externalId  →  channels table  →  tenantId
```

`resolveChannel(provider, externalId)` in `src/lib/tenants.ts`. The external id
comes from the payload itself: YCloud's `to` number, Meta's
`metadata.phone_number_id`, Chatwoot's account/inbox id. Unknown channels do
**not** silently get a tenant — the env credential fallback exists only so a
fresh deployment can bootstrap before its channel row exists, and
`processInbound` still falls back to `getDefaultTenantId()` in that window.

### Admin (authenticated)

`session.user.tenantId` — set at login, carried in the JWT.
`requireTenantId()` in `src/lib/tenants.ts` throws if absent; every server
action calls it first.

## The rules (enforced in review and by `AGENTS.md`)

1. Every Drizzle query on a tenant-owned table includes `eq(table.tenantId, tenantId)`.
2. Every server action starts with `const tenantId = await requireTenantId()`.
3. Every agent tool is built by `buildAgentTools(tenantId, phone)` — there is
   no global tool instance an LLM could reach across tenants.
4. Credentials are loaded per tenant via `loadProviderCredentials(tenantId, provider)`;
   env vars are fallback, never the multi-tenant path.
5. Cross-tenant helpers (`resolveChannel`, the Chatwoot account→tenant map)
   resolve the tenant *first*, then scope everything else to it.
6. `limit(1)` is only safe **with** a tenant condition — a global `limit(1)`
   in a multi-tenant DB is a data leak.
7. Raw SQL (`db.execute(sql`...`)`) gets `tenant_id = ${tenantId}` on every
   table it touches — including subqueries and joins (analytics is the
   canonical example).

## Migrating an existing single-tenant deployment

`drizzle/0001_marvelous_randall.sql` is upgrade-safe:

1. Creates the tenancy tables and enums.
2. Inserts a `default` tenant.
3. Adds `tenant_id` nullable → backfills every existing row into the default
   tenant (children rows inherit through their parent where possible) →
   `SET NOT NULL` + FK.
4. Re-keys the global unique constraints to tenant scope.
5. Drops legacy plaintext secret columns on `agent_config` (`ycloud_api_key`,
   `meta_access_token`, `meta_token_expires_at`) — secrets now live encrypted
   in `credentials`. **Re-enter those secrets** via `credentials` rows or env
   vars after migrating.

## Creating a new tenant

```sql
INSERT INTO tenants (slug, name, status) VALUES ('acme', 'Acme Co', 'active');
INSERT INTO agent_config (tenant_id, enabled) VALUES (<id>, false);
INSERT INTO channels (tenant_id, provider, external_id)
  VALUES (<id>, 'meta', '<phone_number_id>');
-- credentials rows for that tenant's keys
```

Or reuse the seed pattern in `src/db/seed.ts` — it is tenant-aware and
idempotent.
