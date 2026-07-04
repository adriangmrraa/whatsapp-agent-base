import { fetchLeadsAction, type LeadStatus } from "./actions";
import { LeadsClient } from "./leads-client";

export const metadata = { title: "Leads — WhatsApp Business Base" };

interface LeadsPageProps {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;

  const status =
    params.status && VALID_STATUSES.includes(params.status as LeadStatus)
      ? (params.status as LeadStatus)
      : undefined;

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q?.trim() || undefined;

  const result = await fetchLeadsAction({ status, page, q });

  return (
    <LeadsClient
      initialLeads={result.leads}
      initialTotalPages={result.totalPages}
      initialCounts={result.countsByStatus}
      currentStatus={status ?? ""}
      currentPage={page}
      currentQ={q ?? ""}
    />
  );
}
