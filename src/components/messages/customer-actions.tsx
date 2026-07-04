"use client";

import { useCallback } from "react";
import { Bot, ShoppingBag, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToggleHumanOverride } from "@/lib/conversations/queries";

interface ToggleHumanOverrideButtonProps {
  conversationId: number;
}

/**
 * Button to toggle human override mode on a conversation.
 */
export function ToggleHumanOverrideButton({
  conversationId,
}: ToggleHumanOverrideButtonProps) {
  const toggleMutation = useToggleHumanOverride();

  const handleClick = useCallback(() => {
    toggleMutation.mutate(conversationId);
  }, [conversationId, toggleMutation]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 text-xs"
      onClick={handleClick}
      disabled={toggleMutation.isPending}
    >
      <Bot className="h-3.5 w-3.5" />
      Alternar modo humano
    </Button>
  );
}

/**
 * Placeholder button to create an order (coming in Change 5).
 */
export function CreateOrderButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 text-xs"
      disabled
      title="Próximamente — Change 5"
    >
      <ShoppingBag className="h-3.5 w-3.5" />
      Crear pedido
    </Button>
  );
}

/**
 * Placeholder button to edit lead info (coming in Change 5).
 */
export function EditLeadButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 text-xs"
      disabled
      title="Próximamente — Change 5"
    >
      <FileEdit className="h-3.5 w-3.5" />
      Editar lead
    </Button>
  );
}
