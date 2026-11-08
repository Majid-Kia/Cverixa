"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, success, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { saveEditedRevision } from "@/features/resume-tailoring/service";
import { requireUser } from "@/server/security/session";
import { pageFormatSchema } from "@/types/resume-content";
import { deleteResume, duplicateRevision, renameResume, restoreRevision } from "./service";

export async function restoreRevisionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const revisionId = String(formData.get("revisionId") ?? "");
  const revision = await restoreRevision(user.id, revisionId);
  revalidatePath(`/resumes/${revision.resumeId}`);
  redirect(`/resumes/${revision.resumeId}?restored=${revision.version}`);
}

export async function duplicateRevisionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const revisionId = String(formData.get("revisionId") ?? "");
  const created = await duplicateRevision(user.id, revisionId);
  revalidatePath("/resumes");
  redirect(`/resumes/${created.resumeId}`);
}

export async function deleteResumeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const resumeId = String(formData.get("resumeId") ?? "");
  if (resumeId) await deleteResume(user.id, resumeId);
  revalidatePath("/resumes");
  revalidatePath("/dashboard");
  redirect("/resumes");
}

export async function renameResumeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const resumeId = String(formData.get("resumeId") ?? "");
    await renameResume(user.id, resumeId, String(formData.get("title") ?? ""));
    revalidatePath(`/resumes/${resumeId}`);
    revalidatePath("/resumes");
    return success("Renamed.");
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("Could not rename the resume.");
  }
}

/** Save the editor state as a new immutable version. */
export async function saveRevisionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const user = await requireUser();
    const resumeId = String(formData.get("resumeId") ?? "");
    const raw = formData.get("content");
    if (!resumeId || typeof raw !== "string") return failure("Missing resume content.");
    const revision = await saveEditedRevision(user.id, resumeId, {
      templateId: String(formData.get("templateId") ?? ""),
      pageFormat: pageFormatSchema.catch("A4").parse(formData.get("pageFormat")),
      content: JSON.parse(raw),
    });
    revalidatePath(`/resumes/${resumeId}`);
    revalidatePath("/resumes");
    destination = `/resumes/${resumeId}?saved=${revision.version}`;
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    if (error instanceof Error && error.name === "ZodError")
      return failure("The resume content is invalid. Check for empty bullets or missing fields.");
    return failure("The resume could not be saved.");
  }
  redirect(destination);
}
