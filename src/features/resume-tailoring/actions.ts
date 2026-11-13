"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/server/ai/types";
import { requireUser } from "@/server/security/session";
import { pageFormatSchema } from "@/types/resume-content";
import { generationModeSchema } from "./schema";
import { createManualResume, finalizeReview, generateResume } from "./service";

export async function generateResumeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const user = await requireUser();
    const jobDescriptionId = String(formData.get("jobDescriptionId") ?? "");
    if (!jobDescriptionId) return failure("Choose a job description.");
    const mode = generationModeSchema.catch("quick").parse(formData.get("mode"));
    const pageFormat = pageFormatSchema.catch("A4").parse(formData.get("pageFormat"));
    const result = await generateResume(user.id, {
      jobDescriptionId,
      mode,
      templateId: String(formData.get("templateId") ?? ""),
      pageFormat,
      providerId: String(formData.get("providerId") ?? "") || null,
      modelId: String(formData.get("modelId") ?? "") || null,
      userInstructions: String(formData.get("userInstructions") ?? ""),
    });
    destination = result.kind === "quick" ? `/resumes/${result.resumeId}?generated=1` : `/review/${result.runId}`;
  } catch (error) {
    if (error instanceof AppError || error instanceof AIProviderError) return failure(error.message);
    return failure("Generation failed unexpectedly. Your inputs were preserved; please try again.");
  }
  revalidatePath("/resumes");
  revalidatePath("/dashboard");
  redirect(destination);
}

export async function finalizeReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let resumeId: string;
  try {
    const user = await requireUser();
    const runId = String(formData.get("runId") ?? "");
    const raw = formData.get("decisions");
    if (!runId || typeof raw !== "string") return failure("Missing review decisions.");
    const result = await finalizeReview(user.id, runId, JSON.parse(raw), {
      text: String(formData.get("answer") ?? "").slice(0, 1000),
      saveToProfile: formData.get("saveAnswer") === "1",
    });
    resumeId = result.resumeId;
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The reviewed resume could not be saved.");
  }
  revalidatePath("/resumes");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  redirect(`/resumes/${resumeId}?generated=1`);
}

export async function createManualResumeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let resumeId: string;
  try {
    const user = await requireUser();
    const result = await createManualResume(user.id, {
      templateId: String(formData.get("templateId") ?? ""),
      pageFormat: pageFormatSchema.catch("A4").parse(formData.get("pageFormat")),
      title: String(formData.get("title") ?? ""),
    });
    resumeId = result.resumeId;
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The resume could not be created.");
  }
  revalidatePath("/resumes");
  redirect(`/resumes/${resumeId}`);
}
