# Channels: Instagram + Facebook (Meta Graph API)

**Status: implemented (option 1 — one `meta` adapter).** The adapter branches on
`channels.config.channel` (`whatsapp` | `messenger` | `instagram`) for parse and
send; WhatsApp, Messenger and Instagram share the webhook, signature scheme and
verify token. Remaining work is operational: register the `channels` rows, store
the Page access token, and complete Meta App Review. Facts below are from the
official Meta Graph API docs.

> Embedded, one-click connect (no manual token copy) is documented separately in
> [`meta-embedded-signup.md`](meta-embedded-signup.md).

## What Meta exposes

- **Facebook Messenger** — messages to a Facebook **Page**.
- **Instagram Messaging** — messages to an **Instagram Professional account
  linked to a Facebook Page** (a page access token requested by someone with the
  `MESSAGING` task on that Page).

Both are reached through the **Graph API** (`https://graph.facebook.com/vXX/`)
and share the same webhook + Send API mechanics as the WhatsApp Cloud adapter
already in `src/lib/providers/meta.ts`.

## Permissions (App Review required for non-role users)

| Channel | Permissions |
|---|---|
| Messenger | `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` |
| Instagram | `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata` |

Also: the app must be owned by a verified business for Instagram Messaging.

## Webhook

- Subscribe the app to the **`page`** object with the **`messages`** field
  (`POST /{app-id}/subscriptions` with `object=page`, `callback_url`,
  `fields=messages`, `verify_token`).
- GET verification: `hub.mode=subscribe` + `hub.verify_token` (same pattern as
  the existing `meta` route).
- POST signature: **`X-Hub-Signature-256`** — HMAC-SHA256 of the raw body with
  the app secret, timing-safe compare. Identical to the WhatsApp Cloud adapter.

## Sending

- **Send API**: `POST /me/messages` with a Page access token; body
  `{ recipient: { id }, message: { text } }` (Messenger and Instagram
  Messaging share this shape for text; media differs).
- Media/attachments follow the message attachment object with a public CDN URL.

## Mapping to this base

`channels` already supports `provider + externalId → tenant` resolution and
`channelEnum` already contains `instagram` and `messenger`. Two viable models:

1. **Reuse the `meta` provider** — one adapter that branches on
   `channels.config.channel` (`whatsapp` | `messenger` | `instagram`) and on the
   endpoint (`phone_number_id` vs page id vs IG id). Fewer enum values; the
   adapter carries the branching. `externalId` = Page id (Messenger) or the
   Instagram Professional account id.
2. **Distinct providers** — add `meta_messenger` / `meta_instagram` to
   `channelProviderEnum`, each a thin adapter. Cleaner separation, more enum
   churn.

**Recommendation: option 1.** The webhook, signature scheme, verify token and
OAuth/token storage are identical; only the parse + send branches differ, and
`channels.config` already exists for that.

### Adapter checklist (per `docs/providers.md`)

1. Extend the `meta` adapter: `isNoise`, `parseInbound` (read
   `entry[].messaging[]`, sender id, message text/attachments; drop echoes),
   `send` (Send API `/me/messages`).
2. Channel row: `provider='meta'`, `config: { channel: 'instagram', page_id }`,
   `externalId` = IG account id.
3. Credentials: reuse `meta.access_token` (+ `meta.app_secret` for signatures).
   Instagram/Messenger need a **Page** token, not a WABA token — store it as a
   channel-scoped credential if a tenant runs both.
4. Webhook route: reuse `/api/meta/webhook` (add `object=page` handling) or add
   `/api/meta/page-webhook`.

### Tenant + identity notes

- `conversations.whatsappId` holds the customer's provider id (PSID/IGSID) —
  it is already provider-generic despite the name; `channel` records
  `messenger` / `instagram`.
- 24-hour messaging window rules mirror WhatsApp (reply only inside the window
  or with a message tag). The session policy already gates replies by override
  window; extend it per channel when implementing.

## Out of scope here

- Instagram comment/DM features beyond messaging.
- Facebook feed/post publishing.
- App Review submission (operational, per Meta account).
