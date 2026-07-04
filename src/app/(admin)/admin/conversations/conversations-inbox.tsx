"use client";

import { useState, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import {
  useConversations,
  useConversationMessages,
  useSendReply,
  useToggleHumanOverride,
} from "@/lib/conversations/queries";
import { toggleHumanOverrideAction } from "./actions";
import { ConversationSidebar } from "@/components/messages/conversation-sidebar";
import { ChatPanel } from "@/components/messages/chat-panel";
import { CustomerContextPanel } from "@/components/messages/customer-context-panel";
import type { ConversationSummary } from "@/types/chat";

interface Props {
  initialConversations: ConversationSummary[];
}

export function ConversationsInbox({ initialConversations }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<"list" | "chat" | "context">(
    "chat",
  );

  const { data: convData } = useConversations();
  const { data: messages = [] } = useConversationMessages(selectedId);
  const sendMutation = useSendReply();
  const toggleMutation = useToggleHumanOverride();

  const conversations: ConversationSummary[] =
    convData ?? initialConversations;

  const selectedConversation = conversations.find(
    (c) => c.id === selectedId,
  );

  const isHumanOverride = selectedConversation?.humanOverrideUntil
    ? new Date(selectedConversation.humanOverrideUntil) > new Date()
    : false;

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setCurrentView("chat");
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      if (!selectedId) return;
      sendMutation.mutate({ conversationId: selectedId, content });
    },
    [selectedId, sendMutation],
  );

  const handleToggleHuman = useCallback(async () => {
    if (!selectedId) return;
    toggleMutation.mutate(selectedId);
  }, [selectedId, toggleMutation]);

  const handleOpenContext = useCallback(
    () => setCurrentView("context"),
    [],
  );
  const handleBackToList = useCallback(
    () => setCurrentView("list"),
    [],
  );
  const handleBackToChat = useCallback(
    () => setCurrentView("chat"),
    [],
  );

  const contextPanel = selectedId ? (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 lg:hidden">
        <button
          onClick={handleBackToChat}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/5 text-neutral-400"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-neutral-200">
          Perfil del Cliente
        </span>
      </div>
      <CustomerContextPanel conversationId={selectedId} />
    </div>
  ) : null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[#0f0f0f]">
      {/* Col 1: Conversation List */}
      <div
        className={`flex-shrink-0 border-r border-white/5 overflow-hidden ${
          currentView === "list"
            ? "flex flex-col w-full md:w-80"
            : "hidden md:flex md:flex-col md:w-80"
        }`}
      >
        <ConversationSidebar
          conversations={conversations}
          activeId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* Col 2: Chat Panel */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden ${
          currentView === "chat" ? "flex" : "hidden md:flex"
        }`}
      >
        {!selectedId || !selectedConversation ? (
          <div className="flex flex-1 items-center justify-center text-neutral-500">
            <p className="text-sm">Seleccioná una conversación</p>
          </div>
        ) : (
          <ChatPanel
            conversation={selectedConversation}
            messages={messages}
            onSend={handleSend}
            onBack={handleBackToList}
            onShowContext={handleOpenContext}
            onHumanOverride={handleToggleHuman}
            humanOverrideActive={isHumanOverride}
            isSending={sendMutation.isPending}
          />
        )}
      </div>

      {/* Col 3: Customer Context (desktop) */}
      {selectedId && (
        <div className="hidden lg:flex lg:w-[340px] flex-shrink-0 border-l border-white/5 h-full">
          {contextPanel}
        </div>
      )}

      {/* Mobile overlay for context panel */}
      {selectedId && (
        <div
          className={`absolute inset-0 z-40 bg-[#0f0f0f] lg:hidden ${
            currentView === "context" ? "flex flex-col" : "hidden"
          }`}
        >
          {contextPanel}
        </div>
      )}
    </div>
  );
}
