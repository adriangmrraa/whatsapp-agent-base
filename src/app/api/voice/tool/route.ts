import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/tenants";
import { runVoiceToolCall } from "@/lib/voice";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import logger from "@/lib/logger";

// ─── Internal voice tool-call bridge ─────────────────────────────────────────
//
// The browser Realtime client forwards each function call here. The server
// validates the live session (tenant-bound, unexpired), takes the role from the
// session record, and executes the capability through the neutral registry —
// the same tools/data the customer agent uses, gated for staff.

export async function POST(req: NextRequest) {
  try {
    const tenantId = await requireTenantId();

    const rate = await checkRateLimit(`voice-tool:${tenantId}`).catch(() => null);
    if (rate && !rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as {
      sessionId?: string;
      callId?: string;
      name?: string;
      arguments?: unknown;
    } | null;

    const sessionId = body?.sessionId?.trim();
    const callId = body?.callId?.trim();
    const name = body?.name?.trim();
    if (!sessionId || !callId || !name) {
      return NextResponse.json(
        { error: "sessionId, callId and name are required" },
        { status: 400 },
      );
    }

    let args: Record<string, unknown> = {};
    if (body?.arguments && typeof body.arguments === "object") {
      args = body.arguments as Record<string, unknown>;
    } else if (typeof body?.arguments === "string") {
      try {
        const parsed = JSON.parse(body.arguments);
        if (parsed && typeof parsed === "object") {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // malformed argument JSON → treated as empty args by the capability
      }
    }

    const outcome = await runVoiceToolCall({
      tenantId,
      sessionId,
      callId,
      name,
      args,
    });
    if (!outcome.ok) {
      return NextResponse.json(
        { callId: outcome.callId ?? callId, error: outcome.error },
        { status: outcome.error === "invalid_session" ? 401 : 200 },
      );
    }
    return NextResponse.json({ callId: outcome.callId, result: outcome.result });
  } catch (error) {
    logger.error({ error }, "[api:voice/tool] POST failed");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
