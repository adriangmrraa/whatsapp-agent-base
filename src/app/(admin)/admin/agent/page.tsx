import { getConfigAction } from "./actions";
import { AgentConfigClient } from "./agent-config-client";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const config = await getConfigAction();

  return <AgentConfigClient initialConfig={config} />;
}
