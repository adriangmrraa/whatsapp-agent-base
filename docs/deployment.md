# Deployment

## Requirements

- Node.js 20+, PostgreSQL 14+ (Neon/Supabase/RDS/local).
- Upstash Redis — optional but recommended in production (buffer + rate limit
  across instances).
- Public HTTPS URL for provider webhooks (`BASE_URL`).

## Setup

```bash
npm ci
cp .env.example .env.local        # see env reference below
npm run db:migrate                # applies drizzle/ migrations
npm run db:seed                   # default tenant + admin + sample catalog
npm run build && npm start
```

For a brand-new dev DB you can use `npm run db:push` instead of migrate.

## First tenant bootstrap

`db:seed` creates the `DEFAULT_TENANT_SLUG` tenant, an `owner`/`admin` user
(`admin@example.com` / `ADMIN_PASSWORD`), an `agent_config` row, and a sample
catalog. Then:

1. Add a `channels` row for the inbound number (or use the Meta OAuth button).
2. Store provider secrets via `setCredential` (or set env fallbacks).
3. Enable the agent: `agent_config.enabled = true` (admin panel → Agent Config).

## Webhook URLs to register

| Provider | URL | Notes |
|---|---|---|
| YCloud | `POST {BASE_URL}/api/webhook/whatsapp` | secret = tenant's `ycloud.webhook_secret` |
| Meta | `{BASE_URL}/api/meta/webhook` | GET verify token + POST messages; the OAuth connect flow can auto-subscribe |
| Chatwoot | `POST {BASE_URL}/api/chatwoot/webhook` | enable `message_created` events on the account |

## Cron

`POST /api/cron/flush` flushes expired buffers + drains the outbound queue.
Schedule every minute. On Vercel, `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/flush", "schedule": "* * * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when
`CRON_SECRET` is set.

## Health

`GET /api/health` → `{ status, checks: { database, redis } }` — 200 or 503.
Point your uptime monitor here.

## Env reference

See `.env.example` — every variable is documented inline. Minimum viable set
for production: `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`,
`DEFAULT_TENANT_SLUG`, one provider's credentials, `OPENAI_API_KEY` or
`AI_BASE_URL`/`AI_MODEL` + key, `CRON_SECRET`, `BASE_URL`.

## Production checklist

- [ ] `ENCRYPTION_KEY` is a strong random string, stored in your secrets manager
- [ ] `ADMIN_PASSWORD` changed from default (and the seed admin rotated)
- [ ] Per-tenant credentials stored in DB — env vars only as bootstrap
- [ ] Upstash Redis configured (multi-instance safety for buffer/ratelimit)
- [ ] `CRON_SECRET` set + flush scheduled
- [ ] Each tenant's `channels` row registered before webhooks go live
- [ ] `LOG_LEVEL=info`; pino never logs credential values
- [ ] Backup + PITR on the Postgres database
- [ ] Run `npx tsc --noEmit && npx eslint src && npm run build` in CI
