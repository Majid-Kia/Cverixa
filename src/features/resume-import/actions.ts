"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/server/ai/types";
import { requireUser } from "@/server/security/session";
import { confirmImportSession, discardImportSession, importLimits, importResumeDocument } from "./service";
import { careerProfileDataSchema } from "@/features/career-profile/schema";

export async function uploadResumeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let sessionId: string;
  try {
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return failure("Choose a PDF or DOCX file to import.");
    const limits = importLimits();
    if (file.size > limits.maxFileSizeBytes) {
      return failure(`The file exceeds the ${Math.round(limits.maxFileSizeBytes / (1024 * 1024))} MB upload limit.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const providerId = String(formData.get("providerId") ?? "") || null;
    const modelId = String(formData.get("modelId") ?? "") || null;
    const session = await importResumeDocument(user.id, { name: file.name, bytes }, { providerId, modelId });
    sessionId = session.id;
  } catch (error) {
    if (error instanceof AppError || error instanceof AIProviderError) return failure(error.message);
    return failure("The document could not be imported. Please try another file.");
  }
  redirect(`/import/${sessionId}`);
}

export async function confirmImportAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const sessionId = String(formData.get("sessionId") ?? "");
    const raw = formData.get("data");
    if (!sessionId || typeof raw !== "string") return failure("Missing import data.");
    const parsed = careerProfileDataSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return failure(`Please fix the profile: ${issue?.path.join(".") || "root"} ${issue?.message ?? ""}`.trim());
    }
    if (!parsed.data.personal.fullName.trim()) return failure("Full name is required before confirming.");
    const intent = formData.get("intent") === "confirm" ? "confirm" : "save";
    if (intent !== "confirm") {
      return failure('Imported data is held for review only. Use "Confirm profile" to save it as your master profile.');
    }
    await confirmImportSession(user.id, sessionId, parsed.data);
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The imported profile could not be saved.");
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?saved=1");
}

export async function discardImportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId) await discardImportSession(user.id, sessionId);
  redirect("/import");
}
