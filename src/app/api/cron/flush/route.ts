import { NextRequest, NextResponse } from "next/server";
import { BufferManager } from "@/lib/buffer/manager";
import { drainQueue } from "@/lib/queue/worker";
import { timingSafeEqual } from "crypto";

// ─── Cron flush (serverless safety net) ──────────────────────────────────────
// Schedule this endpoint every minute (Vercel Cron / external scheduler).
// It flushes stranded Redis buffers and drains the outbound queue.
// Auth: Authorization: Bearer $CRON_SECRET.

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const buffers = await BufferManager.flushExpired();
  const queued = await drainQueue(50);
  return NextResponse.json({ flushedBuffers: buffers, queuedSent: queued });
}
