import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { executeScan } from "@/features/job-scanner/scan-service";
import { claimDueScans } from "@/features/job-scanner/scheduler";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  // Compare digests so the comparison takes the same time whatever the token length.
  const expected = createHash("sha256").update(secret).digest();
  const received = createHash("sha256").update(token).digest();
  return timingSafeEqual(expected, received);
}

/**
 * Trigger for scheduled scans, called by an external cron (see
 * docs/job-scanner.md). It starts the scans whose scheduled time has passed
 * and returns at once; the scans run after the response. Calling it more often
 * than needed, or from several crons, is harmless: each scheduled slot is
 * claimed once in the database.
 *
 * It is not behind the session cookie (a cron has none) and is protected by
 * the CRON_SECRET bearer token instead. Without a configured secret it is
 * disabled. Add `?wait=1` to hold the response until the scans have finished,
 * for hosts that stop work once a response is sent.
 */
async function handle(request: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Scheduled scans are not configured on this server." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await claimDueScans();
    const run = async () => {
      for (const scan of result.started) await executeScan(scan.scanId);
    };
    if (request.nextUrl.searchParams.get("wait") === "1") await run();
    else after(run);
    return NextResponse.json(
      {
        started: result.started.map((scan) => ({ scanId: scan.scanId, scheduledFor: scan.scheduledFor })),
        skipped: result.skipped.map((slot) => ({ scheduledFor: slot.scheduledFor, reason: slot.reason })),
      },
      { status: result.started.length > 0 ? 202 : 200 },
    );
  } catch (error) {
    logger.error("job_scanner.cron.failed", { reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "The scheduled scan check failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
