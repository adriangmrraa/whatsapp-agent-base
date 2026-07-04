import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getConversationsAction,
  getConversationMessagesAction,
  sendReplyAction,
  toggleHumanOverrideAction,
  updateLeadAction,
  getLeadByConversationAction,
  getOrdersByLeadAction,
} from "@/app/(admin)/admin/conversations/actions";
import type { ConversationSummary, Message } from "@/types/chat";
import { toast } from "sonner";

// ─── Conversations List ──────────────────────────────────────────────────────

/**
 * Polls every 15s for the conversations list.
 */
export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const data = await getConversationsAction();
      return data satisfies ConversationSummary[];
    },
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.hidden) return false;
      return 15_000;
    },
    staleTime: 10_000,
    refetchIntervalInBackground: false,
  });
}

// ─── Conversation Messages ────────────────────────────────────────────────────

/**
 * Polls every 3s for messages when a conversation is selected.
 */
export function useConversationMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ["conversations", conversationId, "messages"],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];
      const data = await getConversationMessagesAction(conversationId);
      return data satisfies Message[];
    },
    enabled: !!conversationId,
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.hidden) return false;
      if (!conversationId) return false;
      return 3_000;
    },
    staleTime: 2_000,
    refetchIntervalInBackground: false,
  });
}

// ─── Send Reply ───────────────────────────────────────────────────────────────

/**
 * Mutation to send a reply message.
 * Optimistically adds the message to the cache.
 */
export function useSendReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: number;
      content: string;
    }) => {
      const result = await sendReplyAction(conversationId, content);
      if (!result.success) throw new Error(result.error ?? "Error al enviar");
    },
    onMutate: async ({ conversationId, content }) => {
      // Optimistically add message to cache
      const queryKey = ["conversations", conversationId, "messages"];
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Message[]>(queryKey);

      const optimistic: Message = {
        id: Date.now(), // temporary id
        conversationId,
        role: "human",
        content,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Message[]>(queryKey, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );

      return { previous, queryKey };
    },
    onError: (_err, { conversationId }, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast.error("Error al enviar el mensaje");
    },
    onSettled: (_data, _err, { conversationId }) => {
      // Refetch to confirm
      queryClient.invalidateQueries({
        queryKey: ["conversations", conversationId, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

// ─── Toggle Human Override ────────────────────────────────────────────────────

/**
 * Mutation to toggle human override mode on a conversation.
 */
export function useToggleHumanOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: number) => {
      const result = await toggleHumanOverrideAction(conversationId);
      if (!result.success) throw new Error(result.error ?? "Error");
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(
        result.active
          ? "Modo humano activado por 30 minutos"
          : "Modo humano desactivado",
      );
    },
    onError: () => {
      toast.error("Error al cambiar modo humano");
    },
  });
}

// ─── Update Lead ──────────────────────────────────────────────────────────────

/**
 * Mutation to update lead info (name, phone, notes).
 */
export function useUpdateConversationLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      data,
    }: {
      leadId: number;
      data: { name?: string; phone?: string; notes?: string };
    }) => {
      const result = await updateLeadAction(leadId, data);
      if (!result.success) throw new Error(result.error ?? "Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      toast.success("Cliente actualizado");
    },
    onError: () => {
      toast.error("Error al actualizar cliente");
    },
  });
}

// ─── Customer Profile ─────────────────────────────────────────────────────────

/**
 * Fetch lead info for a conversation.
 * Stale time 30s — no polling needed for customer profile.
 */
export function useCustomerProfile(conversationId: number | null) {
  return useQuery({
    queryKey: ["customer-profile", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      return getLeadByConversationAction(conversationId);
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}

/**
 * Fetch orders for a lead.
 */
export function useCustomerOrders(
  leadId: number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["customer-orders", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      return getOrdersByLeadAction(leadId);
    },
    enabled: enabled && !!leadId,
    staleTime: 60_000,
  });
}
