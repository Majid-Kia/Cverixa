import "server-only";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import { buildJobAnalysisUserPrompt, JOB_ANALYSIS_SYSTEM_PROMPT } from "@/server/ai/prompts/job-analysis";
import { runStructuredTask } from "@/server/ai/run-task";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import {
  jobAnalysisAiOutputSchema,
  jobAnalysisSchema,
  jobDescriptionInputSchema,
  type JobAnalysis,
  type JobDescriptionInput,
} from "./schema";

export interface JobDescriptionView {
  id: string;
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
  notes: string;
  originalText: string;
  analysis: JobAnalysis | null;
  analysisProviderId: string | null;
  analysisModelId: string | null;
  analyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  sourceUrl: string | null;
  notes: string | null;
  originalText: string;
  structuredRequirements: unknown;
  analysisProviderId: string | null;
  analysisModelId: string | null;
  analyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): JobDescriptionView {
  const parsed = row.structuredRequirements ? jobAnalysisSchema.safeParse(row.structuredRequirements) : null;
  return {
    id: row.id,
    title: row.title ?? "",
    company: row.company ?? "",
    location: row.location ?? "",
    sourceUrl: row.sourceUrl ?? "",
    notes: row.notes ?? "",
    originalText: row.originalText,
    analysis: parsed?.success ? parsed.data : null,
    analysisProviderId: row.analysisProviderId,
    analysisModelId: row.analysisModelId,
    analyzedAt: row.analyzedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createJobDescription(ownerId: string, input: JobDescriptionInput): Promise<JobDescriptionView> {
  const data = jobDescriptionInputSchema.parse(input);
  const row = await prisma.jobDescription.create({
    data: {
      ownerId,
      title: data.title || null,
      company: data.company || null,
      location: data.location || null,
      sourceUrl: data.sourceUrl || null,
      notes: data.notes || null,
      originalText: data.originalText,
    },
  });
  return toView(row);
}

export async function updateJobDescription(
  ownerId: string,
  id: string,
  input: JobDescriptionInput,
): Promise<JobDescriptionView> {
  const existing = await prisma.jobDescription.findFirst({ where: { id, ownerId } });
  if (!existing) throw new NotFoundError("Job description not found.");
  const data = jobDescriptionInputSchema.parse(input);
  const textChanged = data.originalText !== existing.originalText;
  const row = await prisma.jobDescription.update({
    where: { id },
    data: {
      title: data.title || null,
      company: data.company || null,
      location: data.location || null,
      sourceUrl: data.sourceUrl || null,
      notes: data.notes || null,
      originalText: data.originalText,
      // Analysis is only valid for the text it was produced from (NFR-004).
      ...(textChanged
        ? { structuredRequirements: Prisma.DbNull, analyzedAt: null, analysisProviderId: null, analysisModelId: null }
        : {}),
    },
  });
  return toView(row);
}

export async function listJobDescriptions(ownerId: string, limit = 50): Promise<JobDescriptionView[]> {
  const rows = await prisma.jobDescription.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toView);
}

export async function getJobDescription(ownerId: string, id: string): Promise<JobDescriptionView> {
  const row = await prisma.jobDescription.findFirst({ where: { id, ownerId } });
  if (!row) throw new NotFoundError("Job description not found.");
  return toView(row);
}

export async function deleteJobDescription(ownerId: string, id: string): Promise<void> {
  await prisma.jobDescription.deleteMany({ where: { id, ownerId } });
}

/** Stage 1: extract structured requirements with the selected provider and persist them. */
export async function analyzeJobDescription(
  ownerId: string,
  id: string,
  provider?: { providerId?: string | null; modelId?: string | null },
): Promise<JobDescriptionView> {
  const job = await getJobDescription(ownerId, id);
  const selection = await resolveProviderSelection(ownerId, provider);
  const result = await runStructuredTask({
    task: "job_analysis",
    providerId: selection.providerId,
    modelId: selection.modelId,
    schema: jobAnalysisAiOutputSchema,
    system: JOB_ANALYSIS_SYSTEM_PROMPT,
    user: buildJobAnalysisUserPrompt({ text: job.originalText, title: job.title, company: job.company }),
    temperature: 0,
    maxOutputTokens: 8_000,
  });
  const analysis = jobAnalysisSchema.parse({
    jobTitle: result.data.jobTitle || job.title,
    seniority: result.data.seniority,
    summary: result.data.summary,
    requirements: result.data.requirements.map((requirement) => ({
      ...requirement,
      id: newId("req"),
      description: requirement.description.slice(0, 500),
      supportingText: requirement.supportingText.slice(0, 1000),
      relatedSkills: requirement.relatedSkills
        .map((skill) => skill.trim())
        .filter(Boolean)
        .slice(0, 20),
    })),
  });
  const row = await prisma.jobDescription.update({
    where: { id },
    data: {
      structuredRequirements: toJson(analysis),
      analysisProviderId: selection.providerId,
      analysisModelId: result.modelId,
      analyzedAt: new Date(),
      title: job.title || analysis.jobTitle || null,
    },
  });
  return toView(row);
}
