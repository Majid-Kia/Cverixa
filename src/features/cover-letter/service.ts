import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { analyzeJobDescription, getJobDescription } from "@/features/job-analysis/service";
import { planApplication } from "@/features/resume-tailoring/application-brief";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildCoverLetterUserPrompt, COVER_LETTER_SYSTEM_PROMPT } from "@/server/ai/prompts/cover-letter";
import { runStructuredTask } from "@/server/ai/run-task";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { buildCoverLetter, buildCoverLetterContext } from "./build-letter";
import {
  coverLetterAiOutputSchema,
  coverLetterBodySchema,
  coverLetterReportSchema,
  type CoverLetterReport,
} from "./schema";

export interface CoverLetterView {
  id: string;
  jobDescriptionId: string;
  body: string;
  report: CoverLetterReport;
  providerId: string;
  modelId: string;
  userInstructions: string;
  /** True once the owner has saved their own edits. */
  edited: boolean;
  generatedAt: Date;
  updatedAt: Date;
}

function toView(row: {
  id: string;
  jobDescriptionId: string;
  body: string;
  report: unknown;
  providerId: string;
  modelId: string;
  userInstructions: string | null;
  edited: boolean;
  generatedAt: Date;
  updatedAt: Date;
}): CoverLetterView {
  const report = coverLetterReportSchema.safeParse(row.report ?? {});
  return {
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    body: row.body,
    report: report.success ? report.data : coverLetterReportSchema.parse({}),
    providerId: row.providerId,
    modelId: row.modelId,
    userInstructions: row.userInstructions ?? "",
    edited: row.edited,
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  };
}

/** The cover letter for a job, or null when none has been generated yet. */
export async function getCoverLetterForJob(ownerId: string, jobDescriptionId: string): Promise<CoverLetterView | null> {
  const row = await prisma.coverLetter.findFirst({ where: { ownerId, jobDescriptionId } });
  return row ? toView(row) : null;
}

export async function getCoverLetter(ownerId: string, id: string): Promise<CoverLetterView> {
  const row = await prisma.coverLetter.findFirst({ where: { id, ownerId } });
  if (!row) throw new NotFoundError("Cover letter not found.");
  return toView(row);
}

/**
 * Write the cover letter for a job from the confirmed profile, check it
 * against the profile and store it. A job has one letter: generating again
 * replaces it, including any edits the owner made. The Master Career Profile
 * is not changed.
 */
export async function generateCoverLetter(
  ownerId: string,
  input: {
    jobDescriptionId: string;
    providerId?: string | null;
    modelId?: string | null;
    userInstructions?: string;
  },
): Promise<CoverLetterView> {
  const snapshot = await getProfileSnapshot(ownerId);
  if (!snapshot.revisionId || !snapshot.confirmedAt) {
    throw new AppError("profile_not_confirmed", "Confirm your Master Career Profile before generating a cover letter.");
  }
  const profile = confirmedFactsOnly(snapshot.data);
  if (profile.experience.length === 0 && profile.projects.length === 0) {
    throw new AppError("profile_empty", "Your confirmed profile has no experience or projects to write about.");
  }
  const selection = await resolveProviderSelection(ownerId, { providerId: input.providerId, modelId: input.modelId });

  let job = await getJobDescription(ownerId, input.jobDescriptionId);
  if (!job.analysis) job = await analyzeJobDescription(ownerId, job.id, selection);
  const analysis = job.analysis;
  if (!analysis) throw new AppError("analysis_failed", "The job description could not be analysed.");

  const started = Date.now();
  const jobTitle = job.title || analysis.jobTitle;
  const plan = planApplication({ profile, analysis, jobText: job.originalText });
  const userInstructions = input.userInstructions?.trim().slice(0, 2000) ?? "";
  const aiResult = await runStructuredTask({
    task: "cover_letter",
    providerId: selection.providerId,
    modelId: selection.modelId,
    timeoutMs: selection.timeoutMs,
    schema: coverLetterAiOutputSchema,
    system: COVER_LETTER_SYSTEM_PROMPT,
    user: buildCoverLetterUserPrompt({
      profile,
      context: buildCoverLetterContext({ profile, plan, jobTitle, company: job.company }),
      jobText: job.originalText,
      userInstructions,
    }),
    temperature: 0.4,
    maxOutputTokens: 3000,
  });
  const built = buildCoverLetter({
    profile,
    analysis,
    plan,
    jobText: job.originalText,
    jobTitle,
    company: job.company,
    aiOutput: aiResult.data,
  });
  if (!built.body) {
    throw new AppError(
      "validation_failed",
      "The generated letter did not pass the fact check against your profile and was discarded. Try again.",
    );
  }

  const data = {
    body: built.body,
    report: toJson(built.report),
    providerId: selection.providerId,
    modelId: aiResult.modelId,
    userInstructions: userInstructions || null,
    careerProfileRevisionId: snapshot.revisionId,
    edited: false,
    generatedAt: new Date(),
  };
  const row = await prisma.coverLetter.upsert({
    where: { jobDescriptionId: job.id },
    create: { ownerId, jobDescriptionId: job.id, ...data },
    update: data,
  });
  logger.info("cover_letter.generated", {
    jobDescriptionId: job.id,
    provider: selection.providerId,
    model: aiResult.modelId,
    durationMs: Date.now() - started,
    removedSentences: built.report.removed.length,
  });
  return toView(row);
}

/** Save the owner's edits. The text is stored as written; it is not checked or changed. */
export async function saveCoverLetter(ownerId: string, id: string, body: unknown): Promise<CoverLetterView> {
  const parsed = coverLetterBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("invalid_letter", parsed.error.issues[0]?.message ?? "The letter could not be saved.");
  }
  const existing = await prisma.coverLetter.findFirst({ where: { id, ownerId } });
  if (!existing) throw new NotFoundError("Cover letter not found.");
  if (existing.body === parsed.data) return toView(existing);
  const row = await prisma.coverLetter.update({ where: { id }, data: { body: parsed.data, edited: true } });
  return toView(row);
}
