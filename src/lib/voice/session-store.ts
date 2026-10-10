import type { CapabilityRole } from "@/lib/capabilities/types";

// ─── Voice session lifecycle (in-memory registry) ────────────────────────────
//
// Tracks server-issued Realtime sessions so tool calls can be bound to a live,
// tenant-scoped session and expired closed. This is deliberately process-local
// (like the in-memory buffer fallback): it is a coordination aid, NOT the
// security boundary — every tool call still re-checks the tenant via the
// authenticated session. For multi-instance deployments a shared store (Redis)
// can replace this module behind the same interface.

export interface VoiceSessionRecord {
  sessionId: string;
  tenantId: number;
  role: CapabilityRole;
  /** Epoch seconds at which the session is no longer usable. */
  expiresAt: number;
  createdAt: number;
}

const TTL_SAFETY_MS = 5_000;
const sessions = new Map<string, VoiceSessionRecord>();

function now(): number {
  return Date.now();
}

/** Drops expired records. Cheap sweep, called on every access. */
function sweep(): void {
  const ts = Date.now();
  for (const [id, record] of sessions) {
    if (record.expiresAt * 1000 + TTL_SAFETY_MS < ts) sessions.delete(id);
  }
}

export function registerVoiceSession(record: VoiceSessionRecord): void {
  sweep();
  sessions.set(record.sessionId, record);
}

/**
 * Returns the live record for a session id when it belongs to `tenantId` and
 * has not expired. Cross-tenant or unknown/expired ids return null (fail
 * closed — the caller must not execute any capability).
 */
export function validateVoiceSession(
  sessionId: string,
  tenantId: number,
): VoiceSessionRecord | null {
  sweep();
  const record = sessions.get(sessionId);
  if (!record) return null;
  if (record.tenantId !== tenantId) return null;
  if (record.expiresAt * 1000 + TTL_SAFETY_MS < now()) {
    sessions.delete(sessionId);
    return null;
  }
  return record;
}

export function closeVoiceSession(sessionId: string): boolean {
  sweep();
  return sessions.delete(sessionId);
}

export function voiceSessionCount(): number {
  sweep();
  return sessions.size;
}
