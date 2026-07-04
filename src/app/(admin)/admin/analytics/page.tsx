import { getOrdersTimeSeries, getRevenueStats, getLeadConversionStats, getTopProducts } from "./actions";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics — WhatsApp Business Base",
};

interface Props {
  searchParams: Promise<{
    days?: string;
  }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const days = params.days === "30" ? 30 : 7;

  const [timeSeries, revenueStats, leadConversion, topProducts] = await Promise.all([
    getOrdersTimeSeries(days),
    getRevenueStats(),
    getLeadConversionStats(),
    getTopProducts(5),
  ]);

  return (
    <AnalyticsClient
      days={days}
      timeSeries={timeSeries}
      revenueStats={revenueStats}
      leadConversion={leadConversion}
      topProducts={topProducts}
    />
  );
}
