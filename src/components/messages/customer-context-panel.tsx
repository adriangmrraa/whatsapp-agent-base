"use client";

import { useState } from "react";
import {
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Bot,
  ChevronDown,
  MessageSquare,
  UserPlus,
  FileEdit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCustomerProfile,
  useCustomerOrders,
  useConversationMessages,
  useToggleHumanOverride,
} from "@/lib/conversations/queries";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@/types/chat";

interface CustomerContextPanelProps {
  conversationId: number;
  className?: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  converted: { label: "Convertido", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-neutral-400">{label}</span>
      <span className="text-xs text-neutral-200 truncate max-w-[180px] text-right">
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CustomerContextPanel({
  conversationId,
  className,
}: CustomerContextPanelProps) {
  const { data: profile, isLoading } = useCustomerProfile(conversationId);
  const { data: messages } = useConversationMessages(conversationId);
  const toggleMutation = useToggleHumanOverride();
  const [ordersOpen, setOrdersOpen] = useState(false);

  const { data: orders } = useCustomerOrders(
    profile?.id ?? null,
    ordersOpen,
  );

  const isHumanOverride = profile
    ? false // We don't track this here — handled in parent
    : false;

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col h-full overflow-y-auto bg-[#0a0a0a] p-4 space-y-4",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full text-xs text-neutral-500 gap-3 px-4",
          className,
        )}
      >
        <MessageSquare className="h-8 w-8 text-neutral-600" />
        <p className="text-sm">Sin datos del cliente</p>
        <p className="text-xs text-neutral-600">
          Vinculá un lead para ver su perfil
        </p>
      </div>
    );
  }

  const initials = (profile.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const messageCount = messages?.length ?? 0;
  const firstMsg = messages?.[0]?.createdAt;
  const lastMsg = messages?.[messages.length - 1]?.createdAt;
  const leadProfile = profile as unknown as Lead;
  const statusConfig = STATUS_LABELS[leadProfile.status] ?? STATUS_LABELS.new;

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-y-auto bg-[#0a0a0a]",
        className,
      )}
    >
      {/* Header: Avatar + Name + Status */}
      <div className="flex flex-col items-center gap-2 px-4 py-6 border-b border-white/5">
        <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold text-neutral-300">
          {initials}
        </div>
        <div className="text-center">
          <h3 className="text-sm font-medium text-neutral-100">
            {leadProfile.name ?? "Sin nombre"}
          </h3>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <Badge variant={statusConfig.variant}>
              {statusConfig.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-4 text-center">
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-100">
              {messageCount}
            </p>
            <p className="text-[10px] text-neutral-500">Mensajes</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-100">
              {formatDate(firstMsg)}
            </p>
            <p className="text-[10px] text-neutral-500">Primer</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-100">
              {formatDate(lastMsg)}
            </p>
            <p className="text-[10px] text-neutral-500">Último</p>
          </div>
        </div>
      </div>

      {/* Bot status */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Bot className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-neutral-200">IA Activa</p>
              <p className="text-[10px] text-neutral-500">
                Atención automática
              </p>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>

      {/* Contact details */}
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-[10px] font-semibold text-neutral-500 tracking-wider mb-2.5">
          CONTACTO
        </p>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 divide-y divide-white/5">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <UserPlus className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
            <span className="text-xs text-neutral-200">
              {leadProfile.name ?? "Sin nombre"}
            </span>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <Phone className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
            <span className="text-xs text-neutral-200">
              {leadProfile.phone}
            </span>
          </div>
          {leadProfile.email && (
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <Mail className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
              <span className="text-xs text-neutral-200">
                {leadProfile.email}
              </span>
            </div>
          )}
          {leadProfile.address && (
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <MapPin className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
              <span className="text-xs text-neutral-200 truncate">
                {leadProfile.address}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-b border-white/5 space-y-2">
        <p className="text-[10px] font-semibold text-neutral-500 tracking-wider mb-2.5">
          ACCIONES
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={() => {
            if (conversationId) {
              toggleMutation.mutate(conversationId);
            }
          }}
          disabled={toggleMutation.isPending}
        >
          <Bot className="h-3.5 w-3.5" />
          Alternar modo humano
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          disabled
          title="Próximamente"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          Crear pedido
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          disabled
          title="Próximamente"
        >
          <FileEdit className="h-3.5 w-3.5" />
          Editar lead
        </Button>
      </div>

      {/* Order history */}
      <div className="px-4 py-3 border-b border-white/5">
        <button
          onClick={() => setOrdersOpen(!ordersOpen)}
          className="flex w-full items-center justify-between text-[10px] font-semibold text-neutral-500 tracking-wider mb-2.5"
        >
          <span>PEDIDOS</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${ordersOpen ? "rotate-180" : ""}`}
          />
        </button>
        {ordersOpen && orders && orders.length > 0 ? (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-lg bg-white/[0.03] border border-white/5 px-3.5 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-200">
                    #{order.id}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {order.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {order.createdAt instanceof Date
                    ? order.createdAt.toLocaleDateString("es-AR")
                    : String(order.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : ordersOpen ? (
          <p className="text-xs text-neutral-500">Sin pedidos</p>
        ) : null}
      </div>

      {/* Notes */}
      {leadProfile.notes && (
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-[10px] font-semibold text-neutral-500 tracking-wider mb-1.5">
            NOTAS
          </p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            {leadProfile.notes}
          </p>
        </div>
      )}
    </div>
  );
}
