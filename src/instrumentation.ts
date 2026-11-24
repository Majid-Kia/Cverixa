/**
 * Runs once when the server starts. Starts the Job Scanner's in-process
 * schedule trigger on the Node.js server unless it is turned off
 * (JOB_SCAN_INTERNAL_SCHEDULER=false), for example when an external cron
 * calls /api/cron/job-scan instead. See docs/job-scanner.md.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;
  const setting = (process.env.JOB_SCAN_INTERNAL_SCHEDULER ?? "true").toLowerCase();
  if (setting === "false" || setting === "0") return;
  const { startInProcessTrigger } = await import("@/features/job-scanner/scheduler");
  startInProcessTrigger();
}
