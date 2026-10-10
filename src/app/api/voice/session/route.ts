import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/tenants";
import { startVoiceSession, endVoiceSession } from "@/lib/voice";
import type { CapabilityRole } from "@/lib/capabilities/types";
import logger from "@/lib/logger";

// ─── Internal voice agent session endpoint ───────────────────────────────────
//
// Staff-facing (session-authenticated, NOT a webhook). Mints a short-lived
// Realtime client secret carrying the tenant-scoped, role-gated session config.
// The API key never leaves the server.
//
//   POST   → start a session
//   DELETE → end a session ({ sessionId })

function roleFromSession(value: unknown): CapabilityRole {
  return value === "owner" || value === "admin" || value === "viewer"
    ? value
    : "viewer";
}

export async function POST() {
  try {
    const tenantId = await requireTenantId();
    const session = await auth();
    const role = roleFromSession(session?.user?.role);

    const outcome = await startVoiceSession({ tenantId, role });
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: 503 });
    }
    return NextResponse.json(outcome.session, { status: 201 });
  } catch (error) {
    logger.error({ error }, "[api:voice/session] POST failed");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireTenantId();
    const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
    if (body.sessionId) await endVoiceSession(body.sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, "[api:voice/session] DELETE failed");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
