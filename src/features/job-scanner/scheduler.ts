import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { SCAN_LIMITS } from "./constants";
import { executeScan, startScan, type ScanDependencies } from "./scan-service";
import { decideDue, isValidTimeZone, nextRunAfter, TIME_PATTERN } from "./schedule";

export interface ScheduleTickResult {
  /** Scans created by this tick. They still have to be executed. */
  started: Array<{ scanId: string; ownerId: string; scheduledFor: string }>;
  /** Slots that were due but did not start a scan, with the reason. */
  skipped: Array<{ ownerId: string; scheduledFor: string; reason: string }>;
}

/**
 * Start every scheduled scan that is due. Safe to call at any frequency and
 * from several places at once (an external cron, the in-process trigger, two
 * servers): each due slot is claimed with a conditional update that advances
 * `nextRunAt`, so exactly one caller gets it, and the slot itself is unique per
 * owner. The schedule lives in the database, never in a timer, so it survives
 * restarts and does not depend on any browser being open.
 *
 * A slot missed while the server was down runs once when the server is back,
 * unless it is more than `scheduleCatchUpMs` late; then it is recorded as
 * skipped and the schedule waits for its next time.
 */
export async function claimDueScans(now = new Date()): Promise<ScheduleTickResult> {
  const result: ScheduleTickResult = { started: [], skipped: [] };
  const due = await prisma.jobSearchPreferences.findMany({
    where: { scheduleEnabled: true, nextRunAt: { lte: now } },
    select: { id: true, ownerId: true, nextRunAt: true, scheduleTime: true, scheduleTimezone: true },
  });

  for (const preferences of due) {
    const scheduledFor = preferences.nextRunAt;
    if (!scheduledFor) continue;
    const valid = TIME_PATTERN.test(preferences.scheduleTime) && isValidTimeZone(preferences.scheduleTimezone);
    const next = valid ? nextRunAfter(now, preferences.scheduleTime, preferences.scheduleTimezone) : null;
    // Claim the slot: only the caller whose update matches the old value proceeds.
    const claimed = await prisma.jobSearchPreferences.updateMany({
      where: { id: preferences.id, scheduleEnabled: true, nextRunAt: scheduledFor },
      data: { nextRunAt: next },
    });
    if (claimed.count === 0) continue;
    const slot = scheduledFor.toISOString();
    const skip = async (reason: string) => {
      result.skipped.push({ ownerId: preferences.ownerId, scheduledFor: slot, reason });
      // Recorded in the scan history so a skipped run is visible, not silent.
      await prisma.jobScan
        .create({
          data: {
            ownerId: preferences.ownerId,
            trigger: "scheduled",
            status: "skipped",
            scheduledFor,
            finishedAt: now,
            countries: toJson([]),
            keywords: toJson([]),
            sources: toJson([]),
            errorSummary: reason,
          },
        })
        .catch(() => undefined);
    };

    if (decideDue(scheduledFor, now, SCAN_LIMITS.scheduleCatchUpMs) === "missed") {
      await skip(
        "The scheduled time was missed by more than 12 hours (the server was not running). Waiting for the next scheduled time.",
      );
      continue;
    }
    try {
      const { scanId } = await startScan(preferences.ownerId, "scheduled", { scheduledFor });
      result.started.push({ scanId, ownerId: preferences.ownerId, scheduledFor: slot });
    } catch (error) {
      if (error instanceof AppError && error.code === "scan_running") {
        await skip("Another scan was already running at the scheduled time.");
      } else if (error instanceof AppError) {
        await skip(error.message);
      } else {
        logger.error("job_scanner.schedule.start_failed", { ownerId: preferences.ownerId });
        await skip("The scheduled scan could not be started.");
      }
    }
  }
  if (result.started.length || result.skipped.length) {
    logger.info("job_scanner.schedule.tick", { started: result.started.length, skipped: result.skipped.length });
  }
  return result;
}

/** Claim the due scans and run them to completion. */
export async function runDueScans(now = new Date(), deps: ScanDependencies = {}): Promise<ScheduleTickResult> {
  const result = await claimDueScans(now);
  for (const scan of result.started) await executeScan(scan.scanId, deps);
  return result;
}

const TICK_MS = 60_000;
const globalForScheduler = globalThis as unknown as { jobScanTrigger?: NodeJS.Timeout };

/**
 * Optional in-process trigger for servers that stay running (Docker, a VM,
 * `pnpm start`). Once a minute it asks the database whether a scan is due;
 * all schedule state stays in the database, so this adds no state of its own
 * and can run next to an external cron without double runs. On hosts that put
 * the server to sleep it is not enough on its own: use the cron endpoint
 * (see docs/job-scanner.md).
 */
export function startInProcessTrigger(): void {
  if (globalForScheduler.jobScanTrigger) return;
  const tick = async () => {
    try {
      await runDueScans();
    } catch (error) {
      logger.error("job_scanner.schedule.tick_failed", { reason: error instanceof Error ? error.name : "unknown" });
    } finally {
      globalForScheduler.jobScanTrigger = setTimeout(tick, TICK_MS);
      globalForScheduler.jobScanTrigger.unref?.();
    }
  };
  // The first check runs shortly after boot so a run missed during a restart is picked up.
  globalForScheduler.jobScanTrigger = setTimeout(tick, 15_000);
  globalForScheduler.jobScanTrigger.unref?.();
}
