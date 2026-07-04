import { getConversationsAction } from "./actions";
import { ConversationsInbox } from "./conversations-inbox";
import type { ConversationSummary } from "@/types/chat";

export const metadata = { title: "Conversaciones — WhatsApp Business Base" };

export default async function ConversationsPage() {
  const conversations = await getConversationsAction();

  const initialConversations: ConversationSummary[] = conversations.map(
    (c) => ({
      ...c,
      customerPhone: c.customerPhone ?? "",
    }),
  );

  return (
    <ConversationsInbox initialConversations={initialConversations} />
  );
}
