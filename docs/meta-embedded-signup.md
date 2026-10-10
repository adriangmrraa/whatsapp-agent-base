# Meta Embedded Signup

Wire the WhatsApp Business "Connect with Meta" experience directly inside the
admin panel — no manual token copy. Scope on this base: **the server route is
implemented; the browser widget below is the client contract; the account-level
approvals stay manual.**

## Server contract

`POST /api/meta/embedded-signup` — admin session required (`requireTenantId`).

```jsonc
// request
{ "code": "<code from FB.login>", "redirectUri": "<optional>" }

// 200 response — the token is never returned
{
  "ok": true,
  "businessName": "Acme",
  "channels": [
    { "phoneNumberId": "…", "wabaId": "…", "wabaName": "…",
      "displayPhoneNumber": "+54…", "displayName": "Acme" }
  ]
}
```

Internally it exchanges the `code`, upgrades to a long-lived token, stores it
encrypted (`credentials`), discovers WABAs + phone numbers, subscribes the app to
each WABA, and registers a `channels` row per phone number. This is the **same
`provisionMetaAssets` path** used by the OAuth callback
(`src/app/api/meta/callback/route.ts`), so both flows stay identical.

## Client widget

Load the Facebook JS SDK, then launch the embedded signup popup with the app's
`config_id` and the WhatsApp Business scopes:

```html
<script>
  window.fbAsyncInit = function () {
    FB.init({ appId: "<META_APP_ID>", autoLogAppEvents: true, xfbml: true, version: "v22.0" });
  };
</script>
<script async defer src="https://connect.facebook.net/en_US/sdk.js"></script>
```

```js
FB.login(
  function (response) {
    var code = response.authResponse && response.authResponse.code;
    if (!code) return;
    fetch("/api/meta/embedded-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) location.assign("/admin/agent?meta_connected=1");
        else alert(data.error || "Embedded signup failed");
      });
  },
  {
    config_id: "<META_CONFIG_ID>", // from the Meta app's Embedded Signup setup
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {} },
  },
);
```

Register the signup configuration in the Meta App Dashboard (WhatsApp → Embedded
Signup) and put its `config_id` in the snippet. `META_APP_ID` / `META_APP_SECRET`
are read from the environment (or the tenant's stored `meta` credentials).

## Manual approvals (cannot be automated)

- [ ] **Meta App Review** for `whatsapp_business_management` +
      `whatsapp_business_messaging` (needed for any non-role user).
- [ ] A **verified business** owning the app.
- [ ] A **public HTTPS** `BASE_URL` for the OAuth redirect and the webhook
      `{BASE_URL}/api/meta/webhook`.
- [ ] Webhook subscription fields (`messages`) enabled on the app.

The `onboard --meta` step validates that `META_APP_ID` is present and prints this
checklist; it never performs the browser consent itself.
