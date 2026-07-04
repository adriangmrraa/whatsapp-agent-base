import { fetchOrdersAction } from "./actions";
import { OrdersClient } from "./orders-client";

export const metadata = { title: "Orders — WhatsApp Business Base" };

interface Props {
  searchParams: Promise<{
    status?: string;
    paymentStatus?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function OrdersPage({ searchParams }: Props) {
  const params = await searchParams;

  const { orders, totalPages, countsByStatus } = await fetchOrdersAction({
    status: params.status,
    paymentStatus: params.paymentStatus,
    q: params.q,
    page: params.page ? parseInt(params.page) : 1,
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white/90">
          Orders
        </h1>
        <p className="text-sm mt-0.5 text-white/40">
          Manage orders registered by the WhatsApp agent
        </p>
      </div>

      <OrdersClient
        orders={orders}
        totalPages={totalPages}
        currentPage={params.page ? parseInt(params.page) : 1}
        currentStatus={params.status ?? ""}
        currentPaymentStatus={params.paymentStatus ?? ""}
        currentQ={params.q ?? ""}
        countsByStatus={countsByStatus}
      />
    </div>
  );
}
