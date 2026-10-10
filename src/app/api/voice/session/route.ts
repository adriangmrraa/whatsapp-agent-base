import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/tenants";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import {
  startVoiceSession,
  endVoiceSession,
  validateVoiceSession,
} from "@/lib/voice";
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

    // Realtime audio is expensive — minting sessions is a staff action, not a
    // viewer one.
    if (role === "viewer") {
      return NextResponse.json(
        { error: "voice sessions require staff role" },
        { status: 403 },
      );
    }

    const rate = await checkRateLimit(`voice-session:${tenantId}`).catch(
      () => null,
    );
    if (rate && !rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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
    const tenantId = await requireTenantId();
    const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
    // Only the owning tenant may close a session — unguessable ids make this
    // idempotent rather than an oracle.
    if (body.sessionId && validateVoiceSession(body.sessionId, tenantId)) {
      await endVoiceSession(body.sessionId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, "[api:voice/session] DELETE failed");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
