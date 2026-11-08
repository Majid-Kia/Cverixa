"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/security/session";
import { careerProfileDataSchema, markAllConfirmed } from "./schema";
import { saveProfileRevision } from "./service";

function parseProfilePayload(formData: FormData): unknown {
  const raw = formData.get("data");
  if (typeof raw !== "string") throw new AppError("invalid_payload", "Missing profile data.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("invalid_payload", "Profile data could not be parsed.");
  }
}

/** Save the profile as a draft revision (keeps per-entry statuses) or confirm every entry. */
export async function saveProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const intent = formData.get("intent") === "confirm" ? "confirm" : "save";
    const parsed = careerProfileDataSchema.safeParse(parseProfilePayload(formData));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return failure(`Please fix the profile: ${issue?.path.join(".") || "root"} ${issue?.message ?? ""}`.trim());
    }
    const data = intent === "confirm" ? markAllConfirmed(parsed.data) : parsed.data;
    await saveProfileRevision(user.id, data, { confirmed: intent === "confirm" });
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The profile could not be saved. Please try again.");
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?saved=1");
}
