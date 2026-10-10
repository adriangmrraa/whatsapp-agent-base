import type {
  DecisionLayer,
  SystemOneDecision,
  SystemOneDecisionKind,
  SystemOneInput,
} from "./types";

// ─── Hosted decision layer (Jev / Laya API) ──────────────────────────────────
//
// Thin fetch adapter against the hosted System One contract
// (`POST {baseUrl}/v1/decisions`): one round-trip per turn returns the full
// decision set (intent + gates + scores). It throws on EVERY anomaly —
// non-2xx, bad JSON, empty set — because the registry chains it with the
// local rules layer and throwing here IS the fallback trigger. Zero retries:
// the breaker + rules fallback own resilience, not the adapter.
//
// Egress contract (see docs/security.md): the request body carries only the
// message text, the numeric tenantId, and context keys from the allowlist —
// phone numbers, names, and provider external ids never leave the process.

export interface HostedDecisionLayerOptions {
  apiKey: string;
  baseUrl: string;
  engine: string;
  timeoutMs: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

const DECISION_KINDS: readonly SystemOneDecisionKind[] = [
  "choice",
  "score",
  "gate",
  "abstain",
];

const CONTEXT_ALLOWLIST = ["sessionState", "role", "channel"] as const;

function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of CONTEXT_ALLOWLIST) {
    if (key in context) out[key] = context[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface HostedDecisionsResponse {
  decisions?: unknown;
}

function toDecision(
  raw: unknown,
  provider: string,
): SystemOneDecision {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("hosted decision malformed: not an object");
  }
  const d = raw as Partial<SystemOneDecision>;
  if (
    typeof d.kind !== "string" ||
    !DECISION_KINDS.includes(d.kind) ||
    typeof d.label !== "string" ||
    d.label.length === 0
  ) {
    throw new Error("hosted decision malformed: bad kind or label");
  }
  return {
    kind: d.kind,
    label: d.label,
    choice: typeof d.choice === "string" ? d.choice : undefined,
    score: typeof d.score === "number" ? d.score : undefined,
    allow: typeof d.allow === "boolean" ? d.allow : undefined,
    reason: typeof d.reason === "string" ? d.reason : "hosted_decision",
    provider:
      typeof d.provider === "string" && d.provider.length > 0
        ? d.provider
        : provider,
    ttl: typeof d.ttl === "number" ? d.ttl : undefined,
  };
}

export function createHostedDecisionLayer(
  options: HostedDecisionLayerOptions,
): DecisionLayer {
  const provider = `hosted:${options.engine}`;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/v1/decisions`;
  const doFetch = options.fetchFn ?? fetch;

  async function decideSet(
    input: SystemOneInput,
  ): Promise<SystemOneDecision[]> {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        engine: options.engine,
        input: {
          tenantId: input.tenantId,
          surface: input.surface,
          text: input.text,
          context: sanitizeContext(input.context),
          labels: input.labels,
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`hosted decision request failed: ${res.status}`);
    }

    const json = (await res.json()) as HostedDecisionsResponse;
    if (!Array.isArray(json.decisions) || json.decisions.length === 0) {
      throw new Error("hosted decision returned an empty or invalid set");
    }
    return json.decisions.map((raw) => toDecision(raw, provider));
  }

  return {
    name: provider,
    async decide(input: SystemOneInput): Promise<SystemOneDecision> {
      const [first] = await decideSet(input);
      return first;
    },
    decideSet,
  };
}
