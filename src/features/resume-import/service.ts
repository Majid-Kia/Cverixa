import "server-only";
import { careerProfileDataSchema, markAllConfirmed, type CareerProfileData } from "@/features/career-profile/schema";
import { normalizeImportedProfile } from "@/features/career-profile/normalize";
import { saveProfileRevision, type ProfileSnapshot } from "@/features/career-profile/service";
import { resolveProviderSelection } from "@/features/ai-settings/service";
import { getEnv } from "@/lib/env";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { buildProfileImportUserPrompt, PROFILE_IMPORT_SYSTEM_PROMPT } from "@/server/ai/prompts/profile-import";
import { runStructuredTask } from "@/server/ai/run-task";
import { profileImportAiOutputSchema } from "@/server/ai/schemas/profile-import";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { extractDocumentText, DocumentImportError } from "@/server/document-processing";

export interface ImportSessionView {
  id: string;
  fileName: string;
  fileType: string;
  warnings: string[];
  data: CareerProfileData;
  createdAt: Date;
}

export function importLimits() {
  const env = getEnv();
  return { maxFileSizeBytes: Math.round(env.IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024), maxPages: env.IMPORT_MAX_PAGES };
}

/**
 * FR-001 steps 2-6: validate the upload, extract text, convert it with the
 * selected AI provider and store a review session. The original file is not
 * retained.
 */
export async function importResumeDocument(
  ownerId: string,
  file: { name: string; bytes: Uint8Array },
  provider?: { providerId?: string | null; modelId?: string | null },
): Promise<ImportSessionView> {
  const selection = await resolveProviderSelection(ownerId, provider);
  let extracted;
  try {
    extracted = await extractDocumentText(file.bytes, file.name, importLimits());
  } catch (error) {
    if (error instanceof DocumentImportError) {
      logger.info("import.rejected", { code: error.code, fileType: file.name.split(".").pop() ?? "" });
      throw new AppError(`import_${error.code}`, error.message);
    }
    throw error;
  }
  const result = await runStructuredTask({
    task: "profile_import",
    providerId: selection.providerId,
    modelId: selection.modelId,
    schema: profileImportAiOutputSchema,
    system: PROFILE_IMPORT_SYSTEM_PROMPT,
    user: buildProfileImportUserPrompt({ text: extracted.text, fileName: file.name }),
    temperature: 0,
    maxOutputTokens: 16_000,
  });
  const data = normalizeImportedProfile(result.data);
  const warnings = [...result.data.warnings];
  if (!data.personal.fullName.trim())
    warnings.unshift("The candidate name could not be identified. Enter it manually.");
  if (data.experience.length === 0) warnings.unshift("No work experience entries were recognised.");
  const session = await prisma.importSession.create({
    data: {
      ownerId,
      fileName: file.name.slice(0, 200),
      fileType: extracted.fileType,
      warnings: toJson(warnings),
      structuredData: toJson(data),
    },
  });
  logger.info("import.completed", {
    fileType: extracted.fileType,
    pages: extracted.pages,
    provider: selection.providerId,
    model: result.modelId,
  });
  return {
    id: session.id,
    fileName: session.fileName,
    fileType: session.fileType,
    warnings,
    data,
    createdAt: session.createdAt,
  };
}

export async function getImportSession(ownerId: string, id: string): Promise<ImportSessionView> {
  const session = await prisma.importSession.findFirst({ where: { id, ownerId } });
  if (!session) throw new NotFoundError("Import session not found.");
  const data = careerProfileDataSchema.parse(session.structuredData);
  const warnings = Array.isArray(session.warnings) ? (session.warnings as string[]) : [];
  return {
    id: session.id,
    fileName: session.fileName,
    fileType: session.fileType,
    warnings,
    data,
    createdAt: session.createdAt,
  };
}

/** FR-001 steps 7-9: the owner has corrected the data and confirms it as the master profile. */
export async function confirmImportSession(ownerId: string, id: string, editedData: unknown): Promise<ProfileSnapshot> {
  await getImportSession(ownerId, id);
  const parsed = careerProfileDataSchema.parse(editedData);
  const snapshot = await saveProfileRevision(ownerId, markAllConfirmed(parsed), { confirmed: true });
  await prisma.importSession.delete({ where: { id } }).catch(() => undefined);
  return snapshot;
}

export async function discardImportSession(ownerId: string, id: string): Promise<void> {
  await prisma.importSession.deleteMany({ where: { id, ownerId } });
}
