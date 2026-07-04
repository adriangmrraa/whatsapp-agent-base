import { getStatsAction, getRecentActivityAction, getActionCardsAction } from "./dashboard-actions";
import { DashboardClient } from "./dashboard-client";
import type { DashboardStats, ActivityItem, ActionCard } from "./dashboard-actions";

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const [stats, activity, actionCards] = await Promise.all([
    getStatsAction(),
    getRecentActivityAction(),
    getActionCardsAction(),
  ]);

  const cards = buildCardList(stats);

  return <DashboardClient cards={cards} activity={activity} actionCards={actionCards} />;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export interface DashboardCard {
  title: string;
  value: number;
  iconName: "cart" | "dollar" | "userplus" | "trending";
  description: string;
}

function buildCardList(stats: DashboardStats): DashboardCard[] {
  return [
    {
      title: "Total Pedidos",
      value: stats.totalOrders,
      iconName: "cart",
      description: "Pedidos registrados",
    },
    {
      title: "Pedidos Hoy",
      value: stats.ordersToday,
      iconName: "dollar",
      description: "Recibidos hoy",
    },
    {
      title: "Clientes Nuevos",
      value: stats.newClients7d,
      iconName: "userplus",
      description: "Últimos 7 días",
    },
    {
      title: "Leads Totales",
      value: stats.totalLeads,
      iconName: "trending",
      description: "Leads en la base",
    },
  ];
}
