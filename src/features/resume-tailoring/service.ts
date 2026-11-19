import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { hasOwnerAdditions } from "@/features/career-profile/additions";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { appendProfileAdditions, appendProfileFact, getProfileSnapshot } from "@/features/career-profile/service";
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
import { planApplication, reconcilePlan, toBrief } from "./application-brief";
import { buildBaselineContent, buildChangeReport, buildTailoredContent, preserveExperience } from "./build-content";
import { applySupplied, hasSupplied, listCredentialGaps, listGaps, planSupplied } from "./gap-fill";
import {
  applyOwnedCredentials,
  describeOwnedCredential,
  ownedCredentialsInputSchema,
  toOwnerAdditions,
} from "./owned-credentials";
import { acceptedSupplied, applyAnswer, applyDecisions, createProposals } from "./proposals";
import {
  applicationBriefSchema,
  changeReportSchema,
  evidenceMapSchema,
  proposalDecisionSchema,
  proposalSchema,
  reviewAnswerSchema,
  suppliedContentSchema,
  tailoringAiOutputSchema,
  type ApplicationBrief,
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
  /**
   * Cover requirements the profile has no evidence for by adding skills and
   * bullets that are not in the profile. Off unless the owner asks for it; the
   * additions are marked and reported as unverified.
   */
  fillGaps?: boolean;
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
  brief: ApplicationBrief;
}

const reviewStateSchema = z.object({
  baseline: resumeContentSchema,
  tailored: resumeContentSchema,
  proposals: z.array(proposalSchema),
  changeReport: changeReportSchema,
  evidence: evidenceMapSchema,
  /** Null for review sessions started before the application brief existed. */
  brief: applicationBriefSchema.nullable().default(null),
  /** Unverified additions offered as their own proposals (null when gaps are not being covered). */
  supplied: suppliedContentSchema.nullable().default(null),
  /**
   * Degrees, certifications and eligibility the job asks for and the profile
   * does not show. Never written by the application; the owner may enter the
   * ones they hold. Absent on review sessions started before this was stored.
   */
  credentialGaps: z.array(z.string()).optional(),
  pageFormat: pageFormatSchema.default("A4"),
});
type ReviewState = z.infer<typeof reviewStateSchema>;

const credentialGapsOf = (state: ReviewState): string[] => state.credentialGaps ?? state.supplied?.credentials ?? [];

function readReviewState(raw: unknown): ReviewState {
  const state = reviewStateSchema.parse(raw);
  const experience = preserveExperience(state.baseline.experience, state.tailored.experience, state.tailored.featured);
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
    proposals: createProposals(state.baseline, tailored, state.supplied),
    changeReport: buildChangeReport({
      baseline: state.baseline,
      content: tailored,
      evidence: state.evidence,
      rejected: state.changeReport.rejectedClaims,
      notes: state.changeReport.notes,
      brief: state.brief,
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
    // Before drafting: screening criteria, evidence across the whole profile, the project to
    // bring forward, the one question worth asking and what the posting asks applicants to do.
    const initialPlan = planApplication({ profile, analysis, jobText: job.originalText });
    const aiResult = await runStructuredTask({
      task: "resume_tailoring",
      providerId: selection.providerId,
      modelId: selection.modelId,
      timeoutMs: selection.timeoutMs,
      schema: tailoringAiOutputSchema,
      system: RESUME_TAILORING_SYSTEM_PROMPT,
      user: buildResumeTailoringUserPrompt({
        profile,
        analysis,
        evidence: initialPlan.evidence,
        plan: initialPlan,
        gaps: input.fillGaps ? listGaps(analysis, initialPlan.evidence) : [],
        userInstructions: input.userInstructions,
      }),
      temperature: 0.2,
      maxOutputTokens: 12_000,
    });
    const plan = reconcilePlan(initialPlan, aiResult.data.evidencePlan, profile, analysis);
    const evidence = plan.evidence;
    const brief = toBrief(plan);
    const built = buildTailoredContent({
      profile,
      analysis,
      evidence,
      aiOutput: aiResult.data,
      featured: plan.featured,
      brief,
    });
    // Requested gap filling: decided after validation, on the final evidence, and kept apart
    // from validated content so it can be reported and reviewed as unverified.
    const supplied = input.fillGaps
      ? planSupplied({ profile, analysis, evidence, content: built.content, model: aiResult.data.gapFill })
      : null;
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
          content: applySupplied(built.content, supplied),
          changeReport: { ...built.changeReport, supplied },
          generationMetadata: metadata,
          validationStatus: hasSupplied(supplied) ? "with_additions" : built.validationStatus,
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
    const proposals = createProposals(baseline, built.content, supplied);
    const state: ReviewState = {
      baseline,
      tailored: built.content,
      proposals,
      changeReport: built.changeReport,
      evidence,
      brief,
      supplied,
      credentialGaps: listCredentialGaps(analysis, evidence),
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
    return { kind: "review", runId: run.id, proposals, changeReport: built.changeReport, evidence, brief };
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
  /** Null for review sessions started before the application brief existed. */
  brief: ApplicationBrief | null;
  /** Degrees, certifications and eligibility the job asks for that only the owner can add. */
  credentialGaps: string[];
  /** Requirements that a proposed addition (a supplied skill or bullet) would cover. */
  coveredRequirementIds: string[];
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
    brief: state.brief,
    credentialGaps: credentialGapsOf(state),
    coveredRequirementIds: [
      ...new Set(
        [...(state.supplied?.skills ?? []), ...(state.supplied?.bullets ?? [])].map((item) => item.requirementId),
      ),
    ],
    resultResumeId: run.resultResumeId,
  };
}

/**
 * FR-006 step 6: build the tailored resume from accepted proposals and save it
 * as a new resume. An answer to the brief's question is optional; when given
 * it is added to the entry it is about in the owner's own words, and stored on
 * the Master Career Profile only when the owner asks for that. The same goes
 * for degrees, certifications and eligibility the owner enters against a
 * listed requirement: they are placed as typed, never written or checked here.
 */
export async function finalizeReview(
  ownerId: string,
  runId: string,
  decisionsInput: unknown,
  answerInput?: unknown,
  credentialsInput?: unknown,
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
  const answer = reviewAnswerSchema.parse(answerInput ?? {});
  const credentials = ownedCredentialsInputSchema.safeParse(credentialsInput ?? {});
  if (!credentials.success) {
    throw new AppError(
      "invalid_credentials",
      'One of the items you added under "Only you can add these" is incomplete or too long. Remove it or enter it again.',
    );
  }
  const owned = toOwnerAdditions(credentials.data.items, credentialGapsOf(state));
  const entered = new Set(owned.accepted.map((item) => item.requirement));
  const acceptedAdditions = acceptedSupplied(state.supplied, decisions);
  // A requirement the owner has now answered is no longer listed as open.
  const supplied = acceptedAdditions
    ? { ...acceptedAdditions, credentials: acceptedAdditions.credentials.filter((text) => !entered.has(text)) }
    : null;
  let content: ResumeContent = applySupplied(
    applyDecisions(state.baseline, state.tailored, state.proposals, decisions),
    supplied,
  );
  let careerProfileRevisionId = run.careerProfileRevisionId;
  let brief = state.brief;
  const answerNotes: string[] = [];
  const question = state.brief?.question ?? null;
  if (question && answer.text) {
    let profileFactId: string | null = null;
    if (answer.saveToProfile) {
      const saved = await appendProfileFact(ownerId, {
        entryId: question.entryId,
        entryKind: question.entryKind,
        text: answer.text,
      });
      if (saved) {
        profileFactId = saved.factId;
        // The new profile revision is the one this resume was generated from plus the answer.
        if (saved.previousRevisionId === run.careerProfileRevisionId) careerProfileRevisionId = saved.revisionId;
        answerNotes.push(`Your answer was also saved to your Master Career Profile under ${question.entryLabel}.`);
      } else {
        answerNotes.push(
          "Your answer could not be saved to the Master Career Profile; it was added to this resume only.",
        );
      }
    }
    content = applyAnswer(content, question, answer.text, profileFactId);
    answerNotes.unshift(
      `Added your answer to "${question.text}" under ${question.entryLabel}, in your own words. It was not edited or validated by AI.`,
    );
    brief = state.brief ? { ...state.brief, question: null } : null;
  }
  if (hasOwnerAdditions(owned.additions)) {
    content = applyOwnedCredentials(content, owned.additions);
    answerNotes.push(
      `Added what you entered yourself: ${owned.accepted.map(describeOwnedCredential).join("; ")}. It was placed as you wrote it and was not written or checked by AI.`,
    );
    if (credentials.data.saveToProfile) {
      const saved = await appendProfileAdditions(ownerId, owned.additions);
      if (saved) {
        if (saved.previousRevisionId === careerProfileRevisionId) careerProfileRevisionId = saved.revisionId;
        answerNotes.push("What you entered was also saved to your Master Career Profile.");
      } else {
        answerNotes.push(
          "What you entered could not be saved to the Master Career Profile; it was added to this resume only.",
        );
      }
    }
  }
  const accepted = state.proposals.filter((proposal) =>
    decisions.some((decision) => decision.proposalId === proposal.id && decision.decision === "accept"),
  ).length;
  const metadata: GenerationMetadata = {
    providerId: run.providerId,
    modelId: run.modelId,
    mode: "review",
    generationRunId: run.id,
    careerProfileRevisionId,
    jobDescriptionId: run.jobDescriptionId,
    userInstructions: run.userInstructions ?? "",
    generatedAt: new Date().toISOString(),
  };
  const featuredShown = Boolean(content.featured);
  const changeReport: ChangeReport = {
    ...state.changeReport,
    notes: [
      ...state.changeReport.notes,
      `Review Mode: ${accepted} of ${state.proposals.length} proposals accepted.`,
      ...answerNotes,
    ],
    supplied,
    // The brief describes the resume that was actually saved.
    brief: brief
      ? {
          ...brief,
          featured: brief.featured?.placement === "selected_project" && !featuredShown ? null : brief.featured,
        }
      : null,
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
      validationStatus: hasSupplied(supplied)
        ? "with_additions"
        : state.changeReport.rejectedClaims.length > 0
          ? "passed_with_rejections"
          : "passed",
      careerProfileRevisionId,
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
