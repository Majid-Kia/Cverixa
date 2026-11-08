import "server-only";
import {
  changeReportSchema,
  generationMetadataSchema,
  type ChangeReport,
  type GenerationMetadata,
} from "@/features/resume-tailoring/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { isTemplateId, DEFAULT_TEMPLATE_ID } from "@/templates";
import { pageFormatSchema, resumeContentSchema, type PageFormat, type ResumeContent } from "@/types/resume-content";

export interface ResumeRevisionView {
  id: string;
  resumeId: string;
  version: number;
  templateId: string;
  pageFormat: PageFormat;
  careerProfileRevisionId: string | null;
  content: ResumeContent;
  changeReport: ChangeReport | null;
  generationMetadata: GenerationMetadata | null;
  validationStatus: string;
  createdAt: Date;
}

export interface ResumeSummaryView {
  id: string;
  title: string;
  jobDescriptionId: string | null;
  jobTitle: string;
  company: string;
  latestVersion: number;
  latestTemplateId: string;
  latestValidationStatus: string;
  latestProvider: string;
  latestModel: string;
  createdAt: Date;
  updatedAt: Date;
}

function toRevisionView(row: {
  id: string;
  resumeId: string;
  version: number;
  templateId: string;
  pageFormat: string;
  careerProfileRevisionId: string | null;
  content: unknown;
  changeReport: unknown;
  generationMetadata: unknown;
  validationStatus: string;
  createdAt: Date;
}): ResumeRevisionView {
  const changeReport = row.changeReport ? changeReportSchema.safeParse(row.changeReport) : null;
  const metadata = row.generationMetadata ? generationMetadataSchema.safeParse(row.generationMetadata) : null;
  return {
    id: row.id,
    resumeId: row.resumeId,
    version: row.version,
    templateId: isTemplateId(row.templateId) ? row.templateId : DEFAULT_TEMPLATE_ID,
    pageFormat: pageFormatSchema.catch("A4").parse(row.pageFormat),
    careerProfileRevisionId: row.careerProfileRevisionId,
    content: resumeContentSchema.parse(row.content),
    changeReport: changeReport?.success ? changeReport.data : null,
    generationMetadata: metadata?.success ? metadata.data : null,
    validationStatus: row.validationStatus,
    createdAt: row.createdAt,
  };
}

export async function listResumes(ownerId: string, limit = 50): Promise<ResumeSummaryView[]> {
  const rows = await prisma.resume.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      jobDescription: { select: { id: true, title: true, company: true } },
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, templateId: true, validationStatus: true, generationMetadata: true },
      },
    },
  });
  return rows.map((row) => {
    const latest = row.revisions[0];
    const metadata = latest?.generationMetadata ? generationMetadataSchema.safeParse(latest.generationMetadata) : null;
    return {
      id: row.id,
      title: row.title,
      jobDescriptionId: row.jobDescriptionId,
      jobTitle: row.jobDescription?.title ?? "",
      company: row.jobDescription?.company ?? "",
      latestVersion: latest?.version ?? 0,
      latestTemplateId: latest?.templateId ?? DEFAULT_TEMPLATE_ID,
      latestValidationStatus: latest?.validationStatus ?? "unknown",
      latestProvider: metadata?.success ? metadata.data.providerId : "",
      latestModel: metadata?.success ? metadata.data.modelId : "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

export async function getResume(ownerId: string, resumeId: string) {
  const row = await prisma.resume.findFirst({
    where: { id: resumeId, ownerId },
    include: {
      jobDescription: { select: { id: true, title: true, company: true, originalText: true } },
      revisions: { orderBy: { version: "desc" } },
    },
  });
  if (!row) throw new NotFoundError("Resume not found.");
  return {
    id: row.id,
    title: row.title,
    careerProfileId: row.careerProfileId,
    jobDescription: row.jobDescription,
    revisions: row.revisions.map(toRevisionView),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getRevision(ownerId: string, revisionId: string): Promise<ResumeRevisionView> {
  const row = await prisma.resumeRevision.findFirst({ where: { id: revisionId, resume: { ownerId } } });
  if (!row) throw new NotFoundError("Resume version not found.");
  return toRevisionView(row);
}

export async function getLatestRevision(ownerId: string, resumeId: string): Promise<ResumeRevisionView> {
  const row = await prisma.resumeRevision.findFirst({
    where: { resumeId, resume: { ownerId } },
    orderBy: { version: "desc" },
  });
  if (!row) throw new NotFoundError("Resume has no versions.");
  return toRevisionView(row);
}

export interface NewRevisionInput {
  templateId: string;
  pageFormat: PageFormat;
  content: ResumeContent;
  changeReport?: ChangeReport | null;
  generationMetadata?: GenerationMetadata | null;
  validationStatus: string;
  careerProfileRevisionId?: string | null;
}

/** Append an immutable revision to a resume (FR-010). Previous versions are never modified. */
export async function appendRevision(
  ownerId: string,
  resumeId: string,
  input: NewRevisionInput,
): Promise<ResumeRevisionView> {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, ownerId } });
  if (!resume) throw new NotFoundError("Resume not found.");
  const content = resumeContentSchema.parse(input.content);
  const row = await prisma.$transaction(async (tx) => {
    const latest = await tx.resumeRevision.findFirst({ where: { resumeId }, orderBy: { version: "desc" } });
    const created = await tx.resumeRevision.create({
      data: {
        resumeId,
        version: (latest?.version ?? 0) + 1,
        templateId: isTemplateId(input.templateId) ? input.templateId : DEFAULT_TEMPLATE_ID,
        pageFormat: input.pageFormat,
        careerProfileRevisionId: input.careerProfileRevisionId ?? latest?.careerProfileRevisionId ?? null,
        content: toJson(content),
        changeReport: input.changeReport ? toJson(input.changeReport) : undefined,
        generationMetadata: input.generationMetadata ? toJson(input.generationMetadata) : undefined,
        validationStatus: input.validationStatus,
      },
    });
    await tx.resume.update({ where: { id: resumeId }, data: { updatedAt: new Date() } });
    return created;
  });
  return toRevisionView(row);
}

export async function createResume(
  ownerId: string,
  input: { careerProfileId: string; jobDescriptionId: string | null; title: string; revision: NewRevisionInput },
): Promise<{ resumeId: string; revision: ResumeRevisionView }> {
  const content = resumeContentSchema.parse(input.revision.content);
  const resume = await prisma.resume.create({
    data: {
      ownerId,
      careerProfileId: input.careerProfileId,
      jobDescriptionId: input.jobDescriptionId,
      title: input.title.slice(0, 200) || "Untitled resume",
      revisions: {
        create: {
          version: 1,
          templateId: isTemplateId(input.revision.templateId) ? input.revision.templateId : DEFAULT_TEMPLATE_ID,
          pageFormat: input.revision.pageFormat,
          careerProfileRevisionId: input.revision.careerProfileRevisionId ?? null,
          content: toJson(content),
          changeReport: input.revision.changeReport ? toJson(input.revision.changeReport) : undefined,
          generationMetadata: input.revision.generationMetadata ? toJson(input.revision.generationMetadata) : undefined,
          validationStatus: input.revision.validationStatus,
        },
      },
    },
    include: { revisions: true },
  });
  return { resumeId: resume.id, revision: toRevisionView(resume.revisions[0]) };
}

/** Restore an older version's content as a new editable version of the same resume. */
export async function restoreRevision(ownerId: string, revisionId: string): Promise<ResumeRevisionView> {
  const source = await getRevision(ownerId, revisionId);
  return appendRevision(ownerId, source.resumeId, {
    templateId: source.templateId,
    pageFormat: source.pageFormat,
    content: source.content,
    changeReport: source.changeReport,
    generationMetadata: source.generationMetadata,
    validationStatus: source.validationStatus,
    careerProfileRevisionId: source.careerProfileRevisionId,
  });
}

/** Duplicate a version into a brand-new resume. */
export async function duplicateRevision(
  ownerId: string,
  revisionId: string,
): Promise<{ resumeId: string; revision: ResumeRevisionView }> {
  const source = await getRevision(ownerId, revisionId);
  const parent = await prisma.resume.findFirst({ where: { id: source.resumeId, ownerId } });
  if (!parent) throw new NotFoundError("Resume not found.");
  return createResume(ownerId, {
    careerProfileId: parent.careerProfileId,
    jobDescriptionId: parent.jobDescriptionId,
    title: `${parent.title} (copy)`,
    revision: {
      templateId: source.templateId,
      pageFormat: source.pageFormat,
      content: source.content,
      changeReport: source.changeReport,
      generationMetadata: source.generationMetadata,
      validationStatus: source.validationStatus,
      careerProfileRevisionId: source.careerProfileRevisionId,
    },
  });
}

export async function renameResume(ownerId: string, resumeId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new AppError("invalid_title", "Title is required.");
  await prisma.resume.updateMany({ where: { id: resumeId, ownerId }, data: { title: trimmed.slice(0, 200) } });
}

export async function deleteResume(ownerId: string, resumeId: string): Promise<void> {
  await prisma.resume.deleteMany({ where: { id: resumeId, ownerId } });
}
