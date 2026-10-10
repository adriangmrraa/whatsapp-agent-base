import { getCredential } from "@/lib/credentials";
import type {
  ChannelProvider,
  MessagingProvider,
  ProviderCredentials,
} from "./types";
import { ycloudProvider } from "./ycloud";
import { metaProvider } from "./meta";
import { chatwootProvider } from "./chatwoot";

// ─── Provider registry ───────────────────────────────────────────────────────
//
// Adding a provider = implement MessagingProvider + register it here +
// add the enum value in schema + a webhook route.

const providers = new Map<ChannelProvider, MessagingProvider>([
  ["ycloud", ycloudProvider],
  ["meta", metaProvider],
  ["chatwoot", chatwootProvider],
]);

export function getProvider(name: ChannelProvider): MessagingProvider | null {
  return providers.get(name) ?? null;
}

export function listProviders(): ChannelProvider[] {
  return [...providers.keys()];
}

/**
 * Loads the decrypted credential map for (tenant, provider).
 * Convention: `${provider}.${key}` rows in `credentials`, with env fallbacks
 * for bootstrap deployments.
 */
export async function loadProviderCredentials(
  tenantId: number,
  provider: ChannelProvider,
): Promise<ProviderCredentials> {
  switch (provider) {
    case "ycloud":
      return {
        api_key: await getCredential({
          tenantId,
          provider: "ycloud",
          key: "api_key",
          envFallback: process.env.YCLOUD_API_KEY ?? "",
        }),
        webhook_secret: await getCredential({
          tenantId,
          provider: "ycloud",
          key: "webhook_secret",
          envFallback: process.env.YCLOUD_WEBHOOK_SECRET ?? "",
        }),
        phone_number: await getCredential({
          tenantId,
          provider: "ycloud",
          key: "phone_number",
          envFallback: process.env.WHATSAPP_PHONE_NUMBER ?? "",
        }),
      };
    case "meta":
      return {
        access_token: await getCredential({
          tenantId,
          provider: "meta",
          key: "access_token",
          envFallback: process.env.META_ACCESS_TOKEN ?? "",
        }),
        app_secret: await getCredential({
          tenantId,
          provider: "meta",
          key: "app_secret",
          envFallback: process.env.META_APP_SECRET ?? "",
        }),
        app_id: await getCredential({
          tenantId,
          provider: "meta",
          key: "app_id",
          envFallback: process.env.META_APP_ID ?? "",
        }),
        webhook_verify_token: await getCredential({
          tenantId,
          provider: "meta",
          key: "webhook_verify_token",
          envFallback: process.env.META_WEBHOOK_VERIFY_TOKEN ?? "",
        }),
      };
    case "chatwoot":
      return {
        base_url: await getCredential({
          tenantId,
          provider: "chatwoot",
          key: "base_url",
          envFallback: process.env.CHATWOOT_BASE_URL ?? "",
        }),
        api_token: await getCredential({
          tenantId,
          provider: "chatwoot",
          key: "api_token",
          envFallback: process.env.CHATWOOT_API_TOKEN ?? "",
        }),
        account_id: await getCredential({
          tenantId,
          provider: "chatwoot",
          key: "account_id",
          envFallback: process.env.CHATWOOT_ACCOUNT_ID ?? "",
        }),
      };
    case "telegram":
      return {
        bot_token: await getCredential({
          tenantId,
          provider: "telegram",
          key: "bot_token",
          envFallback: process.env.TELEGRAM_BOT_TOKEN ?? "",
        }),
      };
  }
}
