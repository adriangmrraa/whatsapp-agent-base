# Security model

## Threat model

| Threat | Control |
|---|---|
| Forged webhook | Per-tenant HMAC signature verification (YCloud `t,s` scheme; Meta `X-Hub-Signature-256` + `timingSafeEqual`) |
| Replay | YCloud timestamp tolerance (300s); dedup unique index `(tenant_id, platform_message_id)`; session CAS `version` |
| Cross-tenant data access | `tenant_id NOT NULL` + FK on every business table; all queries scoped; tools built per-tenant |
| Secret exposure | AES-256 at rest (`credentials.value_encrypted`); secrets never returned to client components (UI shows presence only); pino logging avoids values |
| Duplicate side effects | Effect-claim table (unique conversation+episode+effect+claimant) |
| Webhook flooding | Upstash rate limit per IP on every webhook route |
| Provider outage / retry storms | Queue + DLQ, circuit breaker, bounded retries (never retry 4xx) |
| AuthZ | NextAuth credentials → JWT carries `tenantId` + `role` (`owner\|admin\|viewer`) |

## Fail-closed rules

These are invariants — never convert them into "best effort":

1. **Signature fails → 401, no mutation.** Not even reading deeper than needed.
2. **Dedup/CAS uncertainty → no reply.** Losing a reply is recoverable;
   sending two is not.
3. **No resolvable tenant → `unresolved_tenant`, logged, no mutation.** Never
   guess a tenant for a stranger payload.
4. **`requireTenantId()` throws** on unauthenticated admin access.
5. Provider send errors → retry budget → queue/DLQ, not a silent drop.

## Credentials

- `ENCRYPTION_KEY` derives the AES-256 key (SHA-256). Rotating it invalidates
  all stored credentials — back it up like a root key.
- Write path: `setCredential({ tenantId, provider, key, value })` encrypts and
  upserts. Read path: `getCredential` decrypts, caches 30s, falls back to env.
- `decryptIfEncrypted` treats non-`iv:ciphertext` values as plaintext — safe
  for hand-migrated rows.
- Admin UI must use `hasCredential` (presence) — never ship decrypted values
  to the client.

## Webhook verification order (important)

Multi-tenant secrets mean the verifier can't know *which* secret to use until
the payload says which channel it targets. The safe order is:

```
parse JSON (untrusted) → provider.parseInbound → resolveChannel → tenant
→ loadProviderCredentials(tenant) → verifySignature → THEN process
```

Parsing before verifying is acceptable only because nothing is persisted,
sent, or trusted pre-verification — the payload merely selects the secret.
Do not add side effects before `verifySignature` in webhook routes.

## Checklist for new code

- [ ] Query scoped by `tenantId`?
- [ ] Secret written via `setCredential`, never into `agent_config`/logs?
- [ ] New webhook → rate limit + per-tenant signature + raw body read?
- [ ] New agent tool → built inside `buildAgentTools(tenantId, ...)`?
- [ ] External side effect → claimed/idempotent?
