import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import { AIProviderError } from "@/server/ai/types";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { SCAN_LIMITS, type ScanPhase, type ScanProgress, type ScanStatus, type ScanTrigger } from "./constants";
import { analyzeListings, loadMatchContext, refreshStaleMatches, type MatchContext } from "./analysis-service";
import { saveCandidate } from "./listings-service";
import { dedupeCandidates, processSourceJob, type Candidate, type ListingFilters, type SkipReason } from "./pipeline";
import { getJobSearchPreferences, getSourceSettings, type SourceSetting } from "./preferences-service";
import { createSourceHttp, sourceErrorMessage } from "./sources/http";
import type { SourceQuery } from "./sources/types";

/** Replaceable parts of a scan, so tests run without the network or real time. */
export interface ScanDependencies {
  /** Used for every source request instead of the global fetch. */
  fetchImpl?: typeof fetch;
  /** Wait between retries. */
  sleep?: (ms: number) => Promise<void>;
  /** Replaces the owner's source settings (adapters under test). */
  sources?: SourceSetting[];
  /** Delay before the single AI retry. */
  aiRetryDelayMs?: number;
}

interface SourceOutcome {
  sourceId: string;
  status: "completed" | "failed" | "skipped";
  fetched: number;
  matched: number;
  requestCount: number;
  durationMs: number;
  error: string | null;
  warnings: string[];
  skipped: Partial<Record<SkipReason, number>>;
  candidates: Candidate[];
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Mark scans that stopped reporting (crashed or redeployed server) as failed and free their lock. */
export async function releaseStaleScans(ownerId?: string, now = new Date()): Promise<number> {
  const result = await prisma.jobScan.updateMany({
    where: {
      ...(ownerId ? { ownerId } : {}),
      status: "running",
      heartbeatAt: { lt: new Date(now.getTime() - SCAN_LIMITS.staleScanMs) },
    },
    data: {
      status: "failed",
      activeLock: null,
      finishedAt: now,
      errorSummary: "The scan was interrupted before it finished (the server stopped or restarted).",
    },
  });
  return result.count;
}

/**
 * Create a scan and take the owner's scan lock. The lock is a unique column,
 * so two scans for one owner cannot start at the same time whatever started
 * them (two clicks, a click during a scheduled run, two servers). A scheduled
 * slot is also unique per owner, so the same slot never runs twice.
 */
export async function startScan(
  ownerId: string,
  trigger: ScanTrigger,
  options: { scheduledFor?: Date } = {},
): Promise<{ scanId: string }> {
  await releaseStaleScans(ownerId);
  const preferences = await getJobSearchPreferences(ownerId);
  if (preferences.keywords.length === 0) {
    throw new AppError("no_keywords", "Add at least one job title in Job Search Preferences before scanning.");
  }
  try {
    const scan = await prisma.jobScan.create({
      data: {
        ownerId,
        trigger,
        status: "running",
        activeLock: ownerId,
        scheduledFor: options.scheduledFor ?? null,
        countries: toJson(preferences.countries),
        keywords: toJson(preferences.keywords),
        sources: toJson([]),
        progress: toJson({ phase: "starting", sourcesDone: 0, sourcesTotal: 0, analyzed: 0, toAnalyze: 0 }),
      },
    });
    return { scanId: scan.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        "scan_running",
        "A scan is already running. Wait for it to finish before starting another.",
        409,
      );
    }
    throw error;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** "30 minutes", "6 hours". */
export function formatInterval(minutes: number): string {
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${Math.round(minutes / 60)} hours`;
}

/** Query one source and turn its postings into candidates. Never throws: a failure is an outcome. */
async function runSource(
  setting: SourceSetting,
  ownerId: string,
  query: SourceQuery,
  filters: ListingFilters,
  deps: ScanDependencies,
): Promise<SourceOutcome> {
  const { source } = setting;
  const started = Date.now();
  const outcome: SourceOutcome = {
    sourceId: source.id,
    status: "completed",
    fetched: 0,
    matched: 0,
    requestCount: 0,
    durationMs: 0,
    error: null,
    warnings: [],
    skipped: {},
    candidates: [],
  };
  const skip = (reason: string): SourceOutcome => ({ ...outcome, status: "skipped", error: reason });

  const unavailable = source.unavailableReason(query, setting.config);
  if (unavailable) return skip(unavailable);
  if (source.limits.minIntervalMinutes > 0) {
    // The source's own guidance on how often it may be read.
    const since = new Date(started - source.limits.minIntervalMinutes * 60_000);
    const recent = await prisma.jobScanSourceResult.findFirst({
      where: { sourceId: source.id, status: "completed", createdAt: { gt: since }, scan: { ownerId } },
      select: { createdAt: true },
    });
    if (recent) {
      return skip(
        `Read less than ${formatInterval(source.limits.minIntervalMinutes)} ago. ${source.displayName} is not queried more often than that, in line with how often it updates and its terms.`,
      );
    }
  }

  const http = createSourceHttp({
    allowedHosts: source.allowedHosts,
    maxRequests: source.limits.maxRequestsPerScan,
    timeoutMs: source.limits.timeoutMs,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  try {
    const result = await source.fetchJobs(query, setting.config, { http });
    outcome.fetched = result.jobs.length;
    outcome.warnings = result.warnings.slice(0, 20);
    for (const job of result.jobs) {
      const processed = processSourceJob(job, { id: source.id, label: source.displayName }, filters);
      if (processed.kind === "keep") outcome.candidates.push(processed.candidate);
      else outcome.skipped[processed.reason] = (outcome.skipped[processed.reason] ?? 0) + 1;
    }
    // Newest first, capped, so one very large board cannot crowd out the scan.
    outcome.candidates.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
    outcome.candidates = outcome.candidates.slice(0, SCAN_LIMITS.maxJobsPerSource);
    outcome.matched = outcome.candidates.length;
  } catch (error) {
    outcome.status = "failed";
    outcome.error = sourceErrorMessage(error);
    logger.warn("job_scanner.source.failed", { source: source.id, reason: outcome.error });
  }
  outcome.requestCount = http.requestCount;
  outcome.durationMs = Date.now() - started;
  return outcome;
}

/**
 * Run a scan that `startScan` created: query the enabled sources, filter,
 * de-duplicate, save, then analyse new listings with the AI provider. Each
 * stage degrades on its own: a failed source leaves the other sources'
 * results in place, and a failed AI stage leaves the discovered listings in
 * place without scores. This function does not throw; the outcome is recorded
 * on the scan.
 */
export async function executeScan(scanId: string, deps: ScanDependencies = {}): Promise<void> {
  const scan = await prisma.jobScan.findUnique({ where: { id: scanId } });
  if (!scan || scan.status !== "running") return;
  const ownerId = scan.ownerId;
  const progress: ScanProgress = { phase: "starting", sourcesDone: 0, sourcesTotal: 0, analyzed: 0, toAnalyze: 0 };
  const report = async (phase: ScanPhase, extra: Prisma.JobScanUpdateInput = {}) => {
    progress.phase = phase;
    await prisma.jobScan.update({
      where: { id: scanId },
      data: { progress: toJson(progress), heartbeatAt: new Date(), ...extra },
    });
  };
  const finish = async (status: ScanStatus, data: Prisma.JobScanUpdateInput = {}) => {
    progress.phase = "done";
    await prisma.jobScan.update({
      where: { id: scanId },
      data: { status, activeLock: null, finishedAt: new Date(), progress: toJson(progress), ...data },
    });
    logger.info("job_scanner.scan.finished", { scanId, status, trigger: scan.trigger });
  };

  try {
    const preferences = await getJobSearchPreferences(ownerId);
    const settings = (deps.sources ?? (await getSourceSettings(ownerId))).filter((setting) => setting.enabled);
    const query: SourceQuery = {
      keywords: preferences.keywords,
      countries: preferences.countries,
      workArrangements: preferences.workArrangements,
    };
    const filters: ListingFilters = { ...query, ...preferences };
    progress.sourcesTotal = settings.length;
    await report("fetching", { sources: toJson(settings.map((setting) => setting.source.id)) });
    if (settings.length === 0) {
      await finish("failed", {
        errorSummary: "No job source is enabled. Enable at least one in Job Search Preferences.",
      });
      return;
    }

    const outcomes = await mapLimit(settings, SCAN_LIMITS.sourceConcurrency, async (setting) => {
      const outcome = await runSource(setting, ownerId, query, filters, deps);
      progress.sourcesDone += 1;
      await report("fetching");
      return outcome;
    });

    // De-duplicate across sources before anything is saved or sent to the AI provider.
    const { unique, duplicates: inScanDuplicates } = dedupeCandidates(
      outcomes.flatMap((outcome) => outcome.candidates),
    );
    await report("saving");
    const perSource = new Map(outcomes.map((outcome) => [outcome.sourceId, { new: 0, duplicate: 0 }]));
    const needsAnalysis: string[] = [];
    let newCount = 0;
    let duplicateCount = inScanDuplicates;
    for (const candidate of unique) {
      const saved = await saveCandidate(ownerId, scanId, candidate);
      const counts = perSource.get(candidate.sourceId)!;
      if (saved.outcome === "new") {
        newCount += 1;
        counts.new += 1;
      } else {
        duplicateCount += 1;
        counts.duplicate += 1;
      }
      if (saved.contentChanged) needsAnalysis.push(saved.listingId);
    }

    await prisma.jobScanSourceResult.createMany({
      data: outcomes.map((outcome) => ({
        scanId,
        sourceId: outcome.sourceId,
        status: outcome.status,
        fetchedCount: outcome.fetched,
        matchedCount: outcome.matched,
        newCount: perSource.get(outcome.sourceId)?.new ?? 0,
        duplicateCount: perSource.get(outcome.sourceId)?.duplicate ?? 0,
        requestCount: outcome.requestCount,
        durationMs: outcome.durationMs,
        error: outcome.error?.slice(0, 500) ?? null,
        diagnostics: toJson({ skipped: outcome.skipped, warnings: outcome.warnings }),
      })),
    });

    const fetched = outcomes.reduce((sum, outcome) => sum + outcome.fetched, 0);
    const filtered = outcomes.reduce(
      (sum, outcome) => sum + Object.values(outcome.skipped).reduce((inner, count) => inner + (count ?? 0), 0),
      0,
    );
    const failedSources = outcomes.filter((outcome) => outcome.status === "failed");
    const ranSources = outcomes.filter((outcome) => outcome.status !== "skipped");
    await report("analyzing", {
      discoveredCount: unique.length,
      newCount,
      duplicateCount,
      filteredCount: filtered,
    });

    // AI matching. Discovery above is already saved and stays whatever happens here.
    const messages: string[] = [];
    let analyzedCount = 0;
    let aiProblem = false;
    let context: MatchContext | null = null;
    try {
      context = await loadMatchContext(ownerId, preferences.rubric);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      messages.push(error.message);
    }
    if (preferences.aiMatchingEnabled && preferences.maxAnalysesPerScan > 0 && context) {
      // New and changed listings first, then earlier ones still waiting; confirmed sponsorship first.
      const pending = await prisma.jobListing.findMany({
        where: {
          ownerId,
          status: { notIn: ["dismissed", "rejected"] },
          OR: [
            { id: { in: needsAnalysis } },
            { analysis: { is: null } },
            { analysis: { is: { status: "failed", attempts: { lt: SCAN_LIMITS.maxAnalysisAttempts } } } },
          ],
        },
        orderBy: [{ sponsorshipRank: "asc" }, { discoveredAt: "desc" }],
        take: preferences.maxAnalysesPerScan,
        select: { id: true },
      });
      progress.toAnalyze = pending.length;
      if (pending.length > 0) {
        try {
          const selection = await resolveProviderSelection(ownerId);
          await report("analyzing");
          const result = await analyzeListings(
            ownerId,
            pending.map((listing) => listing.id),
            selection,
            context,
            {
              retryDelayMs: deps.aiRetryDelayMs,
              onProgress: async (done) => {
                progress.analyzed = done;
                await report("analyzing");
              },
            },
          );
          analyzedCount = result.analyzed;
          if (result.message) {
            aiProblem = true;
            messages.push(result.message);
          }
        } catch (error) {
          if (!(error instanceof AppError) && !(error instanceof AIProviderError)) throw error;
          aiProblem = true;
          messages.push(`AI matching is unavailable: ${error.message} Listings were saved without a score.`);
        }
      }
    } else if (!preferences.aiMatchingEnabled) {
      messages.push("AI matching is turned off in Job Search Preferences; listings were saved without a score.");
    }
    if (context) await refreshStaleMatches(ownerId, context);

    await report("finishing");
    for (const outcome of failedSources) messages.unshift(`${outcome.sourceId}: ${outcome.error}`);
    const status: ScanStatus =
      ranSources.length > 0 && failedSources.length === ranSources.length
        ? "failed"
        : failedSources.length > 0 || aiProblem
          ? "partial"
          : "completed";
    await finish(status, {
      analyzedCount,
      errorSummary: messages.length ? messages.join(" ").slice(0, 1500) : null,
      diagnostics: toJson({
        fetched,
        inScanDuplicates,
        skipped: outcomes.reduce<Record<string, number>>((all, outcome) => {
          for (const [reason, count] of Object.entries(outcome.skipped))
            all[reason] = (all[reason] ?? 0) + (count ?? 0);
          return all;
        }, {}),
        sourcesSkipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
        warnings: outcomes
          .flatMap((outcome) => outcome.warnings.map((warning) => `${outcome.sourceId}: ${warning}`))
          .slice(0, 40),
        aiEnabled: preferences.aiMatchingEnabled,
        analysisLimit: preferences.maxAnalysesPerScan,
      }),
    });
  } catch (error) {
    logger.error("job_scanner.scan.crashed", { scanId, reason: error instanceof Error ? error.name : "unknown" });
    await finish("failed", {
      errorSummary: "The scan stopped because of an unexpected error. Results saved before the error were kept.",
    }).catch(() => undefined);
  }
}

export interface ScanView {
  id: string;
  trigger: ScanTrigger;
  status: ScanStatus;
  startedAt: Date;
  finishedAt: Date | null;
  scheduledFor: Date | null;
  countries: string[];
  keywords: string[];
  sources: string[];
  progress: ScanProgress | null;
  discoveredCount: number;
  newCount: number;
  duplicateCount: number;
  filteredCount: number;
  analyzedCount: number;
  errorSummary: string | null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function toScanView(row: Prisma.JobScanGetPayload<object>): ScanView {
  const progress = row.progress as Partial<ScanProgress> | null;
  return {
    id: row.id,
    trigger: row.trigger === "scheduled" ? "scheduled" : "manual",
    status: (["running", "completed", "partial", "failed", "skipped"] as const).includes(row.status as ScanStatus)
      ? (row.status as ScanStatus)
      : "failed",
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    scheduledFor: row.scheduledFor,
    countries: strings(row.countries),
    keywords: strings(row.keywords),
    sources: strings(row.sources),
    progress:
      progress && typeof progress.phase === "string"
        ? {
            phase: progress.phase as ScanPhase,
            sourcesDone: Number(progress.sourcesDone ?? 0),
            sourcesTotal: Number(progress.sourcesTotal ?? 0),
            analyzed: Number(progress.analyzed ?? 0),
            toAnalyze: Number(progress.toAnalyze ?? 0),
          }
        : null,
    discoveredCount: row.discoveredCount,
    newCount: row.newCount,
    duplicateCount: row.duplicateCount,
    filteredCount: row.filteredCount,
    analyzedCount: row.analyzedCount,
    errorSummary: row.errorSummary,
  };
}

export async function getScan(ownerId: string, id: string): Promise<ScanView> {
  const row = await prisma.jobScan.findFirst({ where: { id, ownerId } });
  if (!row) throw new NotFoundError("Scan not found.");
  return toScanView(row);
}

export interface ScanDetail extends ScanView {
  diagnostics: {
    fetched: number;
    inScanDuplicates: number;
    skipped: Record<string, number>;
    warnings: string[];
  };
  sourceResults: Array<{
    sourceId: string;
    status: string;
    fetchedCount: number;
    matchedCount: number;
    newCount: number;
    duplicateCount: number;
    requestCount: number;
    durationMs: number;
    error: string | null;
    skipped: Record<string, number>;
    warnings: string[];
  }>;
}

const record = (value: unknown): Record<string, number> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([, count]) => typeof count === "number") as Array<[string, number]>,
      )
    : {};

export async function getScanDetail(ownerId: string, id: string): Promise<ScanDetail> {
  const row = await prisma.jobScan.findFirst({
    where: { id, ownerId },
    include: { sourceResults: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new NotFoundError("Scan not found.");
  const diagnostics = (row.diagnostics ?? {}) as Record<string, unknown>;
  return {
    ...toScanView(row),
    diagnostics: {
      fetched: Number(diagnostics.fetched ?? 0),
      inScanDuplicates: Number(diagnostics.inScanDuplicates ?? 0),
      skipped: record(diagnostics.skipped),
      warnings: strings(diagnostics.warnings),
    },
    sourceResults: row.sourceResults.map((result) => {
      const detail = (result.diagnostics ?? {}) as Record<string, unknown>;
      return {
        sourceId: result.sourceId,
        status: result.status,
        fetchedCount: result.fetchedCount,
        matchedCount: result.matchedCount,
        newCount: result.newCount,
        duplicateCount: result.duplicateCount,
        requestCount: result.requestCount,
        durationMs: result.durationMs,
        error: result.error,
        skipped: record(detail.skipped),
        warnings: strings(detail.warnings),
      };
    }),
  };
}

export async function listScans(ownerId: string, limit = 30): Promise<ScanView[]> {
  const rows = await prisma.jobScan.findMany({ where: { ownerId }, orderBy: { startedAt: "desc" }, take: limit });
  return rows.map(toScanView);
}

/** The scan that is running for this owner, if any, and the most recent finished one. */
export async function getScanState(ownerId: string): Promise<{ running: ScanView | null; last: ScanView | null }> {
  await releaseStaleScans(ownerId);
  const [running, last] = await Promise.all([
    prisma.jobScan.findFirst({ where: { ownerId, status: "running" }, orderBy: { startedAt: "desc" } }),
    prisma.jobScan.findFirst({
      where: { ownerId, status: { in: ["completed", "partial", "failed"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  return { running: running ? toScanView(running) : null, last: last ? toScanView(last) : null };
}
