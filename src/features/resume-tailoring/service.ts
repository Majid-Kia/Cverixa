import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { analyzeJobDescription, getJobDescription } from "@/features/job-analysis/service";
import { appendRevision, createResume, type ResumeRevisionView } from "@/features/resume-history/service";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildResumeTailoringUserPrompt, RESUME_TAILORING_SYSTEM_PROMPT } from "@/server/ai/prompts/resume-tailoring";
import { runStructuredTask } from "@/server/ai/run-task";
import { AIProviderError } from "@/server/ai/types";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { DEFAULT_TEMPLATE_ID, isTemplateId } from "@/templates";
import { pageFormatSchema, resumeContentSchema, type PageFormat, type ResumeContent } from "@/types/resume-content";
import { buildBaselineContent, buildChangeReport, buildTailoredContent, preserveExperience } from "./build-content";
import { matchEvidence } from "./evidence";
import { applyDecisions, createProposals } from "./proposals";
import {
  changeReportSchema,
  evidenceMapSchema,
  proposalDecisionSchema,
  proposalSchema,
  tailoringAiOutputSchema,
  type ChangeReport,
  type EvidenceMap,
  type GenerationMetadata,
  type GenerationMode,
  type Proposal,
  type ProposalDecision,
} from "./schema";
import { z } from "zod";

export interface GenerateResumeInput {
  jobDescriptionId: string;
  mode: GenerationMode;
  templateId?: string;
  pageFormat?: PageFormat;
  providerId?: string | null;
  modelId?: string | null;
  userInstructions?: string;
}

export interface QuickGenerateResult {
  kind: "quick";
  runId: string;
  resumeId: string;
  revision: ResumeRevisionView;
}

export interface ReviewGenerateResult {
  kind: "review";
  runId: string;
  proposals: Proposal[];
  changeReport: ChangeReport;
  evidence: EvidenceMap;
}

const reviewStateSchema = z.object({
  baseline: resumeContentSchema,
  tailored: resumeContentSchema,
  proposals: z.array(proposalSchema),
  changeReport: changeReportSchema,
  evidence: evidenceMapSchema,
  pageFormat: pageFormatSchema.default("A4"),
});
type ReviewState = z.infer<typeof reviewStateSchema>;

function readReviewState(raw: unknown): ReviewState {
  const state = reviewStateSchema.parse(raw);
  const experience = preserveExperience(state.baseline.experience, state.tailored.experience);
  if (
    experience.length === state.tailored.experience.length &&
    experience.every((entry, index) => entry === state.tailored.experience[index])
  ) {
    return state;
  }
  const tailored = { ...state.tailored, experience };
  return {
    ...state,
    tailored,
    proposals: createProposals(state.baseline, tailored),
    changeReport: buildChangeReport({
      baseline: state.baseline,
      content: tailored,
      evidence: state.evidence,
      rejected: state.changeReport.rejectedClaims,
      notes: state.changeReport.notes,
    }),
  };
}

/**
 * FR-004/FR-005/FR-006: run the tailoring pipeline. Quick mode saves a new
 * resume version immediately; Review mode stores proposals for the owner to
 * accept, reject or edit. The master profile is never modified.
 */
export async function generateResume(
  ownerId: string,
  input: GenerateResumeInput,
): Promise<QuickGenerateResult | ReviewGenerateResult> {
  const snapshot = await getProfileSnapshot(ownerId);
  if (!snapshot.revisionId || !snapshot.confirmedAt) {
    throw new AppError("profile_not_confirmed", "Confirm your Master Career Profile before generating a resume.");
  }
  const profile = confirmedFactsOnly(snapshot.data);
  if (profile.experience.length === 0 && profile.projects.length === 0) {
    throw new AppError("profile_empty", "Your confirmed profile has no experience or projects to tailor.");
  }
  const selection = await resolveProviderSelection(ownerId, { providerId: input.providerId, modelId: input.modelId });
  const templateId = input.templateId && isTemplateId(input.templateId) ? input.templateId : DEFAULT_TEMPLATE_ID;
  const pageFormat = input.pageFormat ?? "A4";

  let job = await getJobDescription(ownerId, input.jobDescriptionId);
  if (!job.analysis) {
    job = await analyzeJobDescription(ownerId, job.id, selection);
  }
  const analysis = job.analysis;
  if (!analysis) throw new AppError("analysis_failed", "The job description could not be analysed.");

  const run = await prisma.generationRun.create({
    data: {
      ownerId,
      careerProfileRevisionId: snapshot.revisionId,
      jobDescriptionId: job.id,
      providerId: selection.providerId,
      modelId: selection.modelId,
      mode: input.mode,
      templateId,
      userInstructions: input.userInstructions?.slice(0, 2000) || null,
      status: "running",
    },
  });
  const started = Date.now();

  try {
    const evidence = matchEvidence(profile, analysis);
    const aiResult = await runStructuredTask({
      task: "resume_tailoring",
      providerId: selection.providerId,
      modelId: selection.modelId,
      timeoutMs: selection.timeoutMs,
      schema: tailoringAiOutputSchema,
      system: RESUME_TAILORING_SYSTEM_PROMPT,
      user: buildResumeTailoringUserPrompt({ profile, analysis, evidence, userInstructions: input.userInstructions }),
      temperature: 0.2,
      maxOutputTokens: 12_000,
    });
    const built = buildTailoredContent({ profile, analysis, evidence, aiOutput: aiResult.data });
    if (built.validationStatus === "failed") {
      await finishRun(run.id, "failed", "Every generated claim failed factual validation.");
      throw new AppError(
        "validation_failed",
        "The generated content failed factual validation and was discarded. Try again or use Review Mode.",
      );
    }
    const metadata: GenerationMetadata = {
      providerId: selection.providerId,
      modelId: aiResult.modelId,
      mode: input.mode,
      generationRunId: run.id,
      careerProfileRevisionId: snapshot.revisionId,
      jobDescriptionId: job.id,
      userInstructions: input.userInstructions ?? "",
      durationMs: Date.now() - started,
      generatedAt: new Date().toISOString(),
    };

    if (input.mode === "quick") {
      const title = resumeTitle(job.title || analysis.jobTitle, job.company);
      const created = await createResume(ownerId, {
        careerProfileId: snapshot.profileId,
        jobDescriptionId: job.id,
        title,
        revision: {
          templateId,
          pageFormat,
          content: built.content,
          changeReport: built.changeReport,
          generationMetadata: metadata,
          validationStatus: built.validationStatus,
          careerProfileRevisionId: snapshot.revisionId,
        },
      });
      await prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          resultResumeId: created.resumeId,
          resultRevisionId: created.revision.id,
        },
      });
      logger.info("generation.completed", {
        runId: run.id,
        mode: "quick",
        provider: selection.providerId,
        model: aiResult.modelId,
        durationMs: Date.now() - started,
        validation: built.validationStatus,
      });
      return { kind: "quick", runId: run.id, resumeId: created.resumeId, revision: created.revision };
    }

    const baseline = buildBaselineContent(profile);
    const proposals = createProposals(baseline, built.content);
    const state: ReviewState = {
      baseline,
      tailored: built.content,
      proposals,
      changeReport: built.changeReport,
      evidence,
      pageFormat,
    };
    await prisma.generationRun.update({
      where: { id: run.id },
      data: { status: "awaiting_review", proposal: toJson(state) },
    });
    logger.info("generation.completed", {
      runId: run.id,
      mode: "review",
      provider: selection.providerId,
      model: aiResult.modelId,
      durationMs: Date.now() - started,
      proposals: proposals.length,
    });
    return { kind: "review", runId: run.id, proposals, changeReport: built.changeReport, evidence };
  } catch (error) {
    if (!(error instanceof AppError && error.code === "validation_failed")) {
      const reason =
        error instanceof AIProviderError
          ? `${error.category}: ${error.message}`
          : error instanceof AppError
            ? error.message
            : "Unexpected error";
      await finishRun(run.id, "failed", reason);
    }
    throw error;
  }
}

async function finishRun(runId: string, status: "failed", reason: string) {
  await prisma.generationRun
    .update({ where: { id: runId }, data: { status, failureReason: reason.slice(0, 500), finishedAt: new Date() } })
    .catch(() => undefined);
}

export interface ReviewRunView {
  runId: string;
  jobDescriptionId: string;
  jobTitle: string;
  company: string;
  templateId: string;
  pageFormat: PageFormat;
  providerId: string;
  modelId: string;
  status: string;
  proposals: Proposal[];
  changeReport: ChangeReport;
  evidence: EvidenceMap;
  resultResumeId: string | null;
}

export async function getReviewRun(ownerId: string, runId: string): Promise<ReviewRunView> {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, ownerId },
    include: { jobDescription: { select: { title: true, company: true } } },
  });
  if (!run || !run.proposal) throw new NotFoundError("Review session not found.");
  const state = readReviewState(run.proposal);
  return {
    runId: run.id,
    jobDescriptionId: run.jobDescriptionId,
    jobTitle: run.jobDescription.title ?? "",
    company: run.jobDescription.company ?? "",
    templateId: run.templateId,
    pageFormat: state.pageFormat,
    providerId: run.providerId,
    modelId: run.modelId,
    status: run.status,
    proposals: state.proposals,
    changeReport: state.changeReport,
    evidence: state.evidence,
    resultResumeId: run.resultResumeId,
  };
}

/** FR-006 step 6: build the tailored resume from accepted proposals and save it as a new resume. */
export async function finalizeReview(
  ownerId: string,
  runId: string,
  decisionsInput: unknown,
): Promise<{ resumeId: string; revision: ResumeRevisionView }> {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, ownerId },
    include: { jobDescription: true },
  });
  if (!run || !run.proposal) throw new NotFoundError("Review session not found.");
  if (run.status !== "awaiting_review")
    throw new AppError("review_closed", "This review session has already been completed.");
  const state = readReviewState(run.proposal);
  const decisions: ProposalDecision[] = z.array(proposalDecisionSchema).parse(decisionsInput);
  const content: ResumeContent = applyDecisions(state.baseline, state.tailored, state.proposals, decisions);
  const accepted = state.proposals.filter((proposal) =>
    decisions.some((decision) => decision.proposalId === proposal.id && decision.decision === "accept"),
  ).length;
  const metadata: GenerationMetadata = {
    providerId: run.providerId,
    modelId: run.modelId,
    mode: "review",
    generationRunId: run.id,
    careerProfileRevisionId: run.careerProfileRevisionId,
    jobDescriptionId: run.jobDescriptionId,
    userInstructions: run.userInstructions ?? "",
    generatedAt: new Date().toISOString(),
  };
  const changeReport: ChangeReport = {
    ...state.changeReport,
    notes: [...state.changeReport.notes, `Review Mode: ${accepted} of ${state.proposals.length} proposals accepted.`],
  };
  const snapshot = await getProfileSnapshot(ownerId);
  const created = await createResume(ownerId, {
    careerProfileId: snapshot.profileId,
    jobDescriptionId: run.jobDescriptionId,
    title: resumeTitle(run.jobDescription.title ?? "", run.jobDescription.company ?? ""),
    revision: {
      templateId: run.templateId,
      pageFormat: state.pageFormat,
      content,
      changeReport,
      generationMetadata: metadata,
      validationStatus: state.changeReport.rejectedClaims.length > 0 ? "passed_with_rejections" : "passed",
      careerProfileRevisionId: run.careerProfileRevisionId,
    },
  });
  await prisma.generationRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      finishedAt: new Date(),
      resultResumeId: created.resumeId,
      resultRevisionId: created.revision.id,
    },
  });
  return created;
}

/** Create a resume directly from the confirmed profile without AI (manual flow). */
export async function createManualResume(
  ownerId: string,
  input: { templateId?: string; pageFormat?: PageFormat; title?: string },
) {
  const snapshot = await getProfileSnapshot(ownerId);
  if (!snapshot.revisionId || !snapshot.confirmedAt) {
    throw new AppError("profile_not_confirmed", "Confirm your Master Career Profile first.");
  }
  const profile = confirmedFactsOnly(snapshot.data);
  const content = buildBaselineContent(profile);
  return createResume(ownerId, {
    careerProfileId: snapshot.profileId,
    jobDescriptionId: null,
    title: input.title?.trim() || `${profile.personal.fullName} - Resume`,
    revision: {
      templateId: input.templateId && isTemplateId(input.templateId) ? input.templateId : DEFAULT_TEMPLATE_ID,
      pageFormat: input.pageFormat ?? "A4",
      content,
      validationStatus: "passed",
      careerProfileRevisionId: snapshot.revisionId,
    },
  });
}

/** Save an edited version of a resume (editor). Re-validation is not applied to user-authored edits. */
export async function saveEditedRevision(
  ownerId: string,
  resumeId: string,
  input: { templateId: string; pageFormat: PageFormat; content: unknown },
): Promise<ResumeRevisionView> {
  const content = resumeContentSchema.parse(input.content);
  return appendRevision(ownerId, resumeId, {
    templateId: input.templateId,
    pageFormat: input.pageFormat,
    content,
    validationStatus: "user_edited",
  });
}

export async function listRecentRuns(ownerId: string, limit = 10) {
  return prisma.generationRun.findMany({
    where: { ownerId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      mode: true,
      status: true,
      providerId: true,
      modelId: true,
      failureReason: true,
      startedAt: true,
      finishedAt: true,
      resultResumeId: true,
    },
  });
}

function resumeTitle(jobTitle: string, company: string): string {
  const parts = [jobTitle.trim(), company.trim()].filter(Boolean);
  return parts.length ? parts.join(" @ ") : "Tailored resume";
}
