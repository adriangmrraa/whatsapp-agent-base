import { readFile } from "fs/promises";
import { basename } from "path";
import logger from "@/lib/logger";

// ─── Chatwoot API client (ported from clinicforge's chatwoot_client.py) ──────
//
// Used in both directions:
//  - Outbound mirror/inbox: post our messages into Chatwoot conversations.
//  - Handoff: human agents answer inside Chatwoot; the webhook route brings
//    those replies back into the engine and out through the right provider.

export interface ChatwootConfig {
  baseUrl: string;
  apiToken: string;
  accountId: number;
}

interface ChatwootRequestInit {
  method?: string;
  body?: unknown;
  formData?: FormData;
}

export class ChatwootClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ChatwootConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = {
      api_access_token: config.apiToken,
      "Content-Type": "application/json",
    };
    void config.accountId;
  }

  private url(accountId: number, path: string): string {
    return `${this.baseUrl}/api/v1/accounts/${accountId}${path}`;
  }

  private async request<T = Record<string, unknown>>(
    accountId: number,
    path: string,
    init: ChatwootRequestInit = {},
  ): Promise<T> {
    const isForm = !!init.formData;
    const resp = await fetch(this.url(accountId, path), {
      method: init.method ?? (init.body || init.formData ? "POST" : "GET"),
      headers: isForm ? { api_access_token: this.headers.api_access_token } : this.headers,
      body: isForm ? init.formData : init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(isForm ? 30_000 : 10_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      logger.error(
        { accountId, path, status: resp.status, body: text.slice(0, 200) },
        "[chatwoot] request failed",
      );
      throw new Error(`Chatwoot ${resp.status} on ${path}`);
    }
    return (await resp.json().catch(() => ({}))) as T;
  }

  /** Find a contact by phone number, or create one inside the inbox. */
  async findOrCreateContact(input: {
    accountId: number;
    inboxId: number;
    phone: string;
    name?: string;
  }): Promise<{ id: number } | null> {
    try {
      const search = await this.request<{ payload?: { id: number; phone_number?: string }[] }>(
        input.accountId,
        `/contacts/search?q=${encodeURIComponent(input.phone)}`,
      );
      const hit = search.payload?.find((c) => c.phone_number === input.phone) ?? search.payload?.[0];
      if (hit?.id) return { id: hit.id };
    } catch {
      // fall through to create
    }
    try {
      const created = await this.request<{ id?: number; payload?: { contact?: { id: number } } }>(
        input.accountId,
        `/contacts`,
        { body: { inbox_id: input.inboxId, phone_number: input.phone, name: input.name ?? input.phone } },
      );
      const id = created.payload?.contact?.id ?? created.id;
      return id ? { id } : null;
    } catch {
      return null;
    }
  }

  /** Create (or fetch) a conversation for a contact inside an inbox. */
  async createConversation(input: {
    accountId: number;
    inboxId: number;
    contactId: number;
    sourceId?: string;
  }): Promise<{ id: number } | null> {
    try {
      const conv = await this.request<{ id?: number }>(input.accountId, `/conversations`, {
        body: {
          source_id: input.sourceId ?? `phone_${input.contactId}`,
          inbox_id: input.inboxId,
          contact_id: input.contactId,
        },
      });
      return conv.id ? { id: conv.id } : null;
    } catch {
      return null;
    }
  }

  /** Post a text message into a Chatwoot conversation. */
  async sendTextMessage(input: {
    accountId: number;
    conversationId: number;
    text: string;
    messageType?: "incoming" | "outgoing";
    private?: boolean;
  }): Promise<Record<string, unknown> | null> {
    try {
      return await this.request(input.accountId, `/conversations/${input.conversationId}/messages`, {
        body: {
          content: input.text,
          message_type: input.messageType ?? "outgoing",
          private: input.private ?? false,
        },
      });
    } catch {
      return null;
    }
  }

  /** Attach a local file to a Chatwoot conversation (multipart). */
  async sendAttachment(input: {
    accountId: number;
    conversationId: number;
    filePath: string;
    message?: string;
  }): Promise<Record<string, unknown> | null> {
    try {
      const data = await readFile(input.filePath);
      const form = new FormData();
      form.append("content", input.message ?? "");
      form.append("message_type", "outgoing");
      form.append(
        "attachments[]",
        new Blob([data]),
        basename(input.filePath),
      );
      return await this.request(input.accountId, `/conversations/${input.conversationId}/messages`, {
        formData: form,
      });
    } catch (error) {
      logger.error({ error }, "[chatwoot] attachment failed");
      return null;
    }
  }

  /** Typing indicator (typing_on / typing_off). */
  async sendTyping(input: {
    accountId: number;
    conversationId: number;
    on: boolean;
  }): Promise<void> {
    try {
      await this.request(
        input.accountId,
        `/conversations/${input.conversationId}/toggle_typing_status`,
        { body: { typing_status: input.on ? "on" : "off" } },
      );
    } catch {
      // non-fatal
    }
  }
}
