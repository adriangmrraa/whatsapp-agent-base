// ─── Status Utilities ────────────────────────────────────────────────────────
// Shared order status definitions and helpers used across the WhatsApp agent
// and order management tools for consistent status interpretation.

export const ORDER_STATUS_INFO: Record<string, { label: string; color: string; icon: string }> = {
  pending:   { label: "Pendiente",  color: "yellow", icon: "🕐" },
  confirmed: { label: "Confirmado", color: "blue",   icon: "✅" },
  preparing: { label: "Preparando", color: "amber",  icon: "👨‍🍳" },
  ready:     { label: "Listo",      color: "green",  icon: "📦" },
  delivered: { label: "Entregado",  color: "gray",   icon: "✔️" },
  cancelled: { label: "Cancelado",  color: "red",    icon: "❌" },
} as const;

type OrderStatus = keyof typeof ORDER_STATUS_INFO;

/**
 * Return semantic metadata for a given order status.
 * Falls back to a generic entry if the status is unknown.
 */
export function getStatusSemantic(status: string): { label: string; color: string; icon: string } {
  const entry = ORDER_STATUS_INFO[status];
  if (entry) return entry;
  return { label: status, color: "gray", icon: "❓" };
}

/**
 * Check whether a status represents an active (non-terminal) order state.
 * Active statuses: pending, confirmed, preparing, ready.
 * Terminal statuses: delivered, cancelled.
 */
export function isActiveStatus(status: string): boolean {
  return ["pending", "confirmed", "preparing", "ready"].includes(status);
}
