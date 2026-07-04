import { db } from "@/db";
import { attachments } from "@/db/schema";
import type { MediaTypes } from "./types";

export interface StoreMediaOptions {
  leadId?: number;
  conversationId?: number;
  messageId?: number;
  type: MediaTypes;
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  caption?: string | null;
  description?: string | null;
}

/**
 * Store media attachment metadata from an inbound WhatsApp message into the
 * `attachments` table. Handles all media types: image, audio, document, video,
 * sticker.
 *
 * @returns The newly created attachment id.
 */
export async function storeMedia(options: StoreMediaOptions): Promise<number> {
  const [row] = await db
    .insert(attachments)
    .values({
      leadId: options.leadId ?? null,
      conversationId: options.conversationId ?? null,
      messageId: options.messageId ?? null,
      type: options.type,
      url: options.url,
      fileName: options.fileName ?? null,
      mimeType: options.mimeType ?? null,
      fileSize: options.fileSize ?? null,
      caption: options.caption ?? null,
      description: options.description ?? null,
    })
    .returning({ id: attachments.id });

  return row.id;
}
