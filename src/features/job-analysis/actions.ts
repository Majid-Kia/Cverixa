"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, success, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/server/ai/types";
import { requireUser } from "@/server/security/session";
import { jobDescriptionInputSchema } from "./schema";
import { analyzeJobDescription, createJobDescription, deleteJobDescription, updateJobDescription } from "./service";

function readInput(formData: FormData) {
  return jobDescriptionInputSchema.safeParse({
    originalText: formData.get("originalText") ?? "",
    title: formData.get("title") ?? "",
    company: formData.get("company") ?? "",
    location: formData.get("location") ?? "",
    sourceUrl: formData.get("sourceUrl") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let jobId: string;
  try {
    const user = await requireUser();
    const parsed = readInput(formData);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid job description.");
    const job = await createJobDescription(user.id, parsed.data);
    jobId = job.id;
    if (formData.get("analyze") === "true") {
      try {
        await analyzeJobDescription(user.id, job.id);
      } catch (error) {
        if (error instanceof AppError || error instanceof AIProviderError) {
          // Keep the saved job and surface the analysis failure on its page.
          revalidatePath("/jobs");
          redirect(`/jobs/${job.id}?analysisError=${encodeURIComponent(error.message)}`);
        }
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    throw error;
  }
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect(`/jobs/${jobId}`);
}

export async function updateJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = readInput(formData);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid job description.");
    await updateJobDescription(user.id, id, parsed.data);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    return success("Job description saved. Re-run the analysis if the text changed.");
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The job description could not be saved.");
  }
}

export async function analyzeJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const job = await analyzeJobDescription(user.id, id);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    return success(`Analysis complete: ${job.analysis?.requirements.length ?? 0} requirements extracted.`);
  } catch (error) {
    if (error instanceof AppError || error instanceof AIProviderError) return failure(error.message);
    return failure("The job description could not be analysed.");
  }
}

export async function deleteJobAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteJobDescription(user.id, id);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/jobs");
}
