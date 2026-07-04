import { fetchPromotionsAction } from "./actions";
import { PromotionsClient } from "./promotions-client";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await fetchPromotionsAction({ page });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PromotionsClient initialData={data} />
    </div>
  );
}
