import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { confirmedFactsOnly, type CareerProfileData } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { toJobAnalysis } from "@/features/job-analysis/normalize";
import { jobAnalysisSchema } from "@/features/job-analysis/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildJobScreeningUserPrompt, JOB_SCREENING_SYSTEM_PROMPT } from "@/server/ai/prompts/job-screening";
import { runStructuredTask } from "@/server/ai/run-task";
import { AIProviderError, type AIProviderId } from "@/server/ai/types";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { SCAN_LIMITS } from "./constants";
import { visaColumns } from "./listings-service";
import { computeMatch } from "./rubric";
import { jobScreeningAiOutputSchema, screeningSignalsSchema, type Rubric, type ScreeningSignals } from "./schema";
import { sourceLabel } from "./sources/registry";
import { classifyVisaSupport, mergeAiSignals } from "./sponsorship";
import { sha256 } from "./text";

export interface ProviderSelection {
  providerId: AIProviderId;
  modelId: string;
  timeoutMs?: number;
}

/** The confirmed profile a match is computed against, or the reason there is none. */
export interface MatchContext {
  profile: CareerProfileData;
  revisionId: string;
  rubric: Rubric;
  rubricHash: string;
}

export function rubricHash(rubric: Rubric): string {
  return sha256(JSON.stringify(rubric.weights)).slice(0, 16);
}

/** Matching needs a confirmed Master Career Profile; nothing is scored against a draft. */
export async function loadMatchContext(ownerId: string, rubric: Rubric): Promise<MatchContext> {
  const snapshot = await getProfileSnapshot(ownerId);
  if (!snapshot.revisionId || !snapshot.confirmedAt) {
    throw new AppError(
      "profile_not_confirmed",
      "Confirm your Master Career Profile to get Job Match Scores. Listings were saved without a score.",
    );
  }
  return {
    profile: confirmedFactsOnly(snapshot.data),
    revisionId: snapshot.revisionId,
    rubric,
    rubricHash: rubricHash(rubric),
  };
}

function failureText(error: unknown): string {
  if (error instanceof AIProviderError) return `${error.category}: ${error.message}`.slice(0, 500);
  if (error instanceof AppError) return error.message.slice(0, 500);
  return "The analysis failed unexpectedly.";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Extract the requirements of one listing with the AI provider and store them.
 * The result is cached against the hash of the description: the same text is
 * never sent to a provider twice, whatever happens to the profile afterwards.
 * Returns whether a provider call was made.
 */
export async function screenListing(
  ownerId: string,
  listingId: string,
  selection: ProviderSelection,
  options: { force?: boolean; retryDelayMs?: number } = {},
): Promise<{ called: boolean }> {
  const listing = await prisma.jobListing.findFirst({ where: { id: listingId, ownerId }, include: { analysis: true } });
  if (!listing) throw new NotFoundError("Job listing not found.");
  const cached = listing.analysis;
  if (
    !options.force &&
    cached &&
    cached.status === "completed" &&
    cached.descriptionHash === listing.descriptionHash &&
    cached.analysis
  ) {
    return { called: false };
  }
  const sameText = cached?.descriptionHash === listing.descriptionHash;
  const attempts = (sameText ? (cached?.attempts ?? 0) : 0) + 1;

  try {
    const run = () =>
      runStructuredTask({
        task: "job_screening",
        providerId: selection.providerId,
        modelId: selection.modelId,
        timeoutMs: selection.timeoutMs,
        schema: jobScreeningAiOutputSchema,
        system: JOB_SCREENING_SYSTEM_PROMPT,
        user: buildJobScreeningUserPrompt({
          text: listing.description,
          title: listing.title,
          company: listing.company,
          location: listing.location,
        }),
        temperature: 0,
        maxOutputTokens: 8_000,
      });
    let result;
    try {
      result = await run();
    } catch (error) {
      // One retry with backoff for transient failures (rate limit, timeout, malformed output).
      if (!(error instanceof AIProviderError) || !error.retryable) throw error;
      await wait(options.retryDelayMs ?? 2_000);
      result = await run();
    }
    const analysis = toJobAnalysis(result.data, { originalText: listing.description, title: listing.title });
    if (!analysis) throw new AppError("analysis_invalid", "The AI returned an analysis that could not be used.");
    const signals: ScreeningSignals = {
      sponsorship: result.data.sponsorship,
      relocation: result.data.relocation,
      workAuthorization: result.data.workAuthorization,
      yearsOfExperience: result.data.yearsOfExperience,
    };
    // The classification is rebuilt from the posting text; the AI can only add verified quotes to it.
    const sourceFlag = (Array.isArray(listing.sponsorshipEvidence) ? listing.sponsorshipEvidence : []).some(
      (item) => typeof item === "object" && item !== null && (item as { basis?: unknown }).basis === "source_flag",
    );
    const base = classifyVisaSupport(listing.description, {
      sourceUrl: listing.url,
      sourceFlag: sourceFlag ? { label: sourceLabel(listing.sourceId) } : null,
    });
    const visa = mergeAiSignals(base, signals, listing.description, listing.url);
    const data = {
      descriptionHash: listing.descriptionHash,
      status: "completed",
      failureReason: null,
      attempts,
      providerId: selection.providerId,
      modelId: result.modelId,
      analysis: toJson(analysis),
      signals: toJson(signals),
      analyzedAt: new Date(),
      // A new extraction invalidates the previous match.
      careerProfileRevisionId: null,
      rubricHash: null,
      score: null,
    };
    await prisma.$transaction([
      prisma.jobMatchAnalysis.upsert({
        where: { listingId: listing.id },
        update: data,
        create: { ownerId, listingId: listing.id, ...data },
      }),
      prisma.jobListing.update({ where: { id: listing.id }, data: { ...visaColumns(visa), matchScore: null } }),
    ]);
    return { called: true };
  } catch (error) {
    const data = {
      descriptionHash: listing.descriptionHash,
      status: "failed",
      failureReason: failureText(error),
      attempts,
      providerId: selection.providerId,
      modelId: selection.modelId,
    };
    await prisma.jobMatchAnalysis.upsert({
      where: { listingId: listing.id },
      // Keep an earlier extraction of the same text; only the status of this attempt changes.
      update: sameText && cached?.status === "completed" ? { attempts } : { ...data, analysis: undefined },
      create: { ownerId, listingId: listing.id, ...data },
    });
    throw error;
  }
}

/**
 * Compute the Job Match Score of a listing from its stored requirements and
 * the confirmed profile. No AI call. Skipped when the stored score already
 * belongs to this profile revision and rubric.
 */
export async function refreshMatch(listingId: string, context: MatchContext): Promise<boolean> {
  const row = await prisma.jobMatchAnalysis.findUnique({
    where: { listingId },
    include: { listing: { select: { title: true, descriptionHash: true } } },
  });
  if (!row || row.status !== "completed" || !row.analysis) return false;
  if (row.descriptionHash !== row.listing.descriptionHash) return false;
  if (
    row.score !== null &&
    row.careerProfileRevisionId === context.revisionId &&
    row.rubricHash === context.rubricHash
  ) {
    return false;
  }
  const analysis = jobAnalysisSchema.safeParse(row.analysis);
  if (!analysis.success) return false;
  const signals = screeningSignalsSchema.safeParse(row.signals);
  const match = computeMatch({
    profile: context.profile,
    analysis: analysis.data,
    jobTitle: row.listing.title,
    rubric: context.rubric,
    requiredYears: signals.success ? signals.data.yearsOfExperience : null,
  });
  await prisma.$transaction([
    prisma.jobMatchAnalysis.update({
      where: { listingId },
      data: {
        careerProfileRevisionId: context.revisionId,
        rubricVersion: match.rubricVersion,
        rubricHash: context.rubricHash,
        score: match.score,
        breakdown: toJson(match.breakdown),
        explanation: match.explanation,
        matchingSkills: toJson(match.matchingSkills),
        missingQualifications: toJson(match.missingQualifications),
        matchedAt: new Date(),
      },
    }),
    prisma.jobListing.update({ where: { id: listingId }, data: { matchScore: match.score } }),
  ]);
  return true;
}

/** Recompute stale scores after the profile or the rubric changed. Deterministic; no provider call. */
export async function refreshStaleMatches(ownerId: string, context: MatchContext, limit = 500): Promise<number> {
  const rows = await prisma.jobMatchAnalysis.findMany({
    where: {
      ownerId,
      status: "completed",
      OR: [
        { score: null },
        { careerProfileRevisionId: { not: context.revisionId } },
        { rubricHash: { not: context.rubricHash } },
        { careerProfileRevisionId: null },
      ],
    },
    select: { listingId: true },
    take: limit,
  });
  let refreshed = 0;
  for (const row of rows) if (await refreshMatch(row.listingId, context)) refreshed += 1;
  return refreshed;
}

export interface AnalysisRunResult {
  analyzed: number;
  failed: number;
  /** Set when the run stopped early or could not start; shown to the owner. */
  message: string | null;
}

/**
 * Analyse a batch of listings with bounded concurrency. A failed listing does
 * not stop the others, but repeated failures in a row do: a provider that is
 * down or out of quota should not be called for every remaining listing.
 */
export async function analyzeListings(
  ownerId: string,
  listingIds: string[],
  selection: ProviderSelection,
  context: MatchContext | null,
  options: { onProgress?: (done: number) => Promise<void> | void; retryDelayMs?: number } = {},
): Promise<AnalysisRunResult> {
  let analyzed = 0;
  let failed = 0;
  let streak = 0;
  let done = 0;
  let stopped: string | null = null;
  let cursor = 0;

  const worker = async () => {
    while (cursor < listingIds.length && !stopped) {
      const listingId = listingIds[cursor];
      cursor += 1;
      try {
        await screenListing(ownerId, listingId, selection, { retryDelayMs: options.retryDelayMs });
        if (context) await refreshMatch(listingId, context);
        analyzed += 1;
        streak = 0;
      } catch (error) {
        failed += 1;
        streak += 1;
        const fatal =
          error instanceof AIProviderError && (error.category === "auth" || error.category === "not_configured");
        if (fatal || streak >= SCAN_LIMITS.aiFailureStreak) {
          stopped = `AI analysis stopped: ${error instanceof Error ? error.message : "the provider failed repeatedly"}`;
        }
        logger.warn("job_scanner.analysis.failed", {
          listingId,
          category: error instanceof AIProviderError ? error.category : "unknown",
        });
      }
      done += 1;
      await options.onProgress?.(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_LIMITS.aiConcurrency, listingIds.length) }, worker));
  return {
    analyzed,
    failed,
    message: stopped ?? (failed > 0 ? `${failed} listing${failed === 1 ? "" : "s"} could not be analysed.` : null),
  };
}

/** Analyse one listing on request (the "Analyse" button on a listing). */
export async function analyzeListingNow(ownerId: string, listingId: string, rubric: Rubric): Promise<void> {
  const selection = await resolveProviderSelection(ownerId);
  const context = await loadMatchContext(ownerId, rubric);
  await screenListing(ownerId, listingId, selection, { force: true });
  await refreshMatch(listingId, context);
}
