"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/security/session";
import { saveProviderSetting } from "./service";

export async function saveProviderSettingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const providerId = String(formData.get("providerId") ?? "");
    const modelId = String(formData.get("modelId") ?? "");
    const makeDefault = formData.get("makeDefault") === "true";
    const timeoutRaw = String(formData.get("timeoutMs") ?? "").trim();
    await saveProviderSetting(user.id, {
      providerId,
      modelId,
      makeDefault,
      configuration: timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {},
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return success(
      makeDefault
        ? `${providerId} is now the default provider (${modelId}).`
        : `Saved model ${modelId} for ${providerId}.`,
    );
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    if (error instanceof Error && error.name === "ZodError")
      return failure("Timeout must be between 5,000 and 600,000 milliseconds.");
    return failure("Settings could not be saved.");
  }
}
