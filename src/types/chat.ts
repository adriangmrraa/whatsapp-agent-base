export interface ConversationSummary {
  id: number;
  whatsappId: string;
  customerName: string | null;
  customerPhone: string | null;
  status: "active" | "closed" | "archived";
  channel: "whatsapp" | "telegram";
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount?: number;
  messageCount?: number;
  humanOverrideUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system" | "human";
  content: string;
  contentAttributes?: Array<{
    type: "image" | "audio" | "document" | "video";
    url: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    caption?: string;
    transcription?: string;
    description?: string;
  }>;
  platformMessageId?: string;
  createdAt: string;
}

export interface Lead {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  status: "new" | "contacted" | "converted" | "lost";
  type: string | null;
  tags: string[];
  notes: string | null;
  conversationId: number | null;
  createdAt: string;
}

export interface OrderSummary {
  id: number;
  phoneNumber: string;
  customerName: string | null;
  address: string | null;
  orderType: string | null;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  items: unknown;
  paymentStatus: string | null;
  paymentMethod: string | null;
  deliveryFee: string | null;
  createdAt: string;
}
