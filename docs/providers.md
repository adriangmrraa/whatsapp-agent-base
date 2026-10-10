# Providers

Providers are pluggable messaging transports. The engine talks to a
`MessagingProvider` interface — it never sees provider SDKs.

## The interface

`src/lib/providers/types.ts`:

```ts
interface MessagingProvider {
  provider: ChannelProvider;                       // "ycloud" | "meta" | "telegram" | "chatwoot"
  verifySignature(input: { rawBody; headers; credentials }): Promise<boolean>;
  isNoise(payload: unknown): boolean;              // echoes, statuses → skip
  parseInbound(payload: unknown): NormalizedInbound[];
  send(input: { credentials; channelExternalId; to; payload }): Promise<SendResult>;
}
```

`NormalizedInbound` is the engine's currency: `{ provider, messageId,
externalUserId, channelExternalId, kind, text, media, raw }`.

## Registered providers

`src/lib/providers/registry.ts` holds the map. `loadProviderCredentials(tenantId,
provider)` resolves a `ProviderCredentials` bag from the `credentials` table
with env fallbacks.

### YCloud (`ycloud`)

- Webhook: `POST /api/webhook/whatsapp`
- Signature: `YCloud-Signature` header `t=<ts>,s=<hmac>` — HMAC-SHA256 of
  `t.rawBody` with the tenant's `webhook_secret`, 5-minute replay tolerance.
- Credentials: `ycloud.api_key`, `ycloud.webhook_secret`, `ycloud.phone_number`
  (env: `YCLOUD_API_KEY`, `YCLOUD_WEBHOOK_SECRET`, `WHATSAPP_PHONE_NUMBER`).
- Channel external id: the business phone number (`to`).

### Meta WhatsApp Cloud API (`meta`)

- Webhook: `GET|POST /api/meta/webhook`; OAuth: `/api/meta/connect` → `/api/meta/callback`.
- Signature: `X-Hub-Signature-256` — HMAC-SHA256 of raw body with `app_secret`,
  timing-safe compare.
- GET verification: `hub.verify_token` checked against `META_WEBHOOK_VERIFY_TOKEN`
  env or the default tenant's `meta.webhook_verify_token` credential.
- OAuth flow (admin "Connect with Meta" button): `lib/meta/oauth.ts` exchanges
  the code, discovers WABA + phone_number_id, stores the token in
  `credentials` (encrypted), fills `agent_config.meta_*`, subscribes the app.
- Credentials: `meta.access_token`, `meta.app_secret`, `meta.app_id`,
  `meta.webhook_verify_token`.
- Channel external id: `metadata.phone_number_id`.

### Chatwoot (`chatwoot`)

- Webhook: `POST /api/chatwoot/webhook` — receives `message_created` events.
- Modes (`agent_config.chatwoot_mode`):
  - `inbox` — human agents answer inside Chatwoot; outgoing human messages are
    bridged back to the customer through the conversation's owning provider
    (ycloud/meta) and apply a 24h `human_override`.
  - `mirror` — observe only.
- Tenant resolution: Chatwoot `account.id` → `agent_config.chatwoot_account_id`.
- Credentials: `chatwoot.base_url`, `chatwoot.api_token`, `chatwoot.account_id`.
- Client: `src/lib/chatwoot/client.ts` (create contact/conversation, send
  text/attachment, typing indicator).

## Adding a provider — checklist

1. **Enum**: add the name to `channelProviderEnum` in `src/db/schema.ts` and
   generate a migration.
2. **Adapter**: create `src/lib/providers/<name>.ts` implementing
   `MessagingProvider`. Normalize inbound into `NormalizedInbound`; set
   `channelExternalId` to whatever identifies the tenant's endpoint.
3. **Registry**: register it in `providers` map + add its credential keys to
   `loadProviderCredentials`.
4. **Webhook route**: `src/app/api/<name>/webhook/route.ts` — thin shell:
   rate-limit → raw body → parse → `resolveChannel` → `verifySignature` →
   `processInbound`. Copy `api/webhook/whatsapp/route.ts` as the template.
5. **Outbound**: nothing else needed — `provider.send` is called by the engine.

The whole contract is ~5 hooks; a working adapter is typically ≤ 150 lines.

## Outbound payloads

```ts
{ kind: "text", text }
{ kind: "image" | "audio" | "video" | "document", url, caption?, fileName? }
```

Adapters translate to provider API shapes (`buildBody` in the YCloud adapter,
`buildMetaBody` in Meta's).

## Noise and protocol artifacts

`isNoise` lets each provider declare its non-message events: YCloud status
callbacks, Meta `statuses` changes, etc. The pipeline answers 200 and does no
work — no lead upsert, no session touch, no dedup row.
