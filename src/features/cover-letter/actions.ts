"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, success, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/server/ai/types";
import { requireUser } from "@/server/security/session";
import { generateCoverLetter, saveCoverLetter } from "./service";

const letterPath = (jobId: string) => `/jobs/${jobId}/cover-letter`;

/**
 * "Generate cover letter" on the job page: write the letter and open it. A
 * failure also lands on the letter page, which shows the reason and lets the
 * owner try again.
 */
export async function startCoverLetterAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const jobId = String(formData.get("jobDescriptionId") ?? "");
  if (!jobId) redirect("/jobs");
  let error = "";
  try {
    await generateCoverLetter(user.id, { jobDescriptionId: jobId });
  } catch (caught) {
    if (!(caught instanceof AppError || caught instanceof AIProviderError)) throw caught;
    error = caught.message;
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(letterPath(jobId));
  redirect(error ? `${letterPath(jobId)}?error=${encodeURIComponent(error)}` : letterPath(jobId));
}

/** Generate or regenerate from the letter page, with optional instructions. */
export async function generateCoverLetterAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobDescriptionId") ?? "");
  try {
    const user = await requireUser();
    if (!jobId) return failure("Choose a job description.");
    await generateCoverLetter(user.id, {
      jobDescriptionId: jobId,
      userInstructions: String(formData.get("userInstructions") ?? ""),
    });
  } catch (error) {
    if (error instanceof AppError || error instanceof AIProviderError) return failure(error.message);
    return failure("The cover letter could not be generated. Please try again.");
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(letterPath(jobId));
  return success("Cover letter generated.");
}

export async function saveCoverLetterAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const letter = await saveCoverLetter(user.id, String(formData.get("id") ?? ""), formData.get("body") ?? "");
    revalidatePath(letterPath(letter.jobDescriptionId));
    return success("Saved.");
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The letter could not be saved.");
  }
}
