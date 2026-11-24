"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { failure, success, type ActionState } from "@/lib/action-result";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/server/ai/types";
import { RateLimiter } from "@/server/security/rate-limit";
import { requireUser } from "@/server/security/session";
import { analyzeListingNow } from "./analysis-service";
import { SCAN_LIMITS } from "./constants";
import { importJobPosting, prepareTailoring, setListingStatus } from "./listings-service";
import { getJobSearchPreferences, saveJobSearchPreferences, saveSourceSetting } from "./preferences-service";
import { executeScan, startScan } from "./scan-service";
import { parseBoards } from "./sources/boards";

export type ScanActionState = ActionState & { scanId?: string };

const globalForLimiter = globalThis as unknown as { manualScanLimiter?: RateLimiter };
/** Manual scans per owner per hour, on top of the one-scan-at-a-time lock. */
const manualScanLimiter =
  globalForLimiter.manualScanLimiter ??
  (globalForLimiter.manualScanLimiter = new RateLimiter(SCAN_LIMITS.manualScansPerHour, 60 * 60 * 1000));

const lines = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export async function saveJobSearchPreferencesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const saved = await saveJobSearchPreferences(user.id, {
      countries: formData.getAll("countries").map(String),
      keywords: lines(formData.get("keywords")),
      workArrangements: formData.getAll("workArrangements").map(String),
      requireSponsorship: formData.get("requireSponsorship") === "on",
      preferRelocation: formData.get("preferRelocation") === "on",
      excludeWorkAuthRequired: formData.get("excludeWorkAuthRequired") === "on",
      excludeNoSponsorship: formData.get("excludeNoSponsorship") === "on",
      aiMatchingEnabled: formData.get("aiMatchingEnabled") === "on",
      maxAnalysesPerScan: formData.get("maxAnalysesPerScan") ?? 25,
      rubric: {
        weights: {
          mandatory: formData.get("weightMandatory") ?? 40,
          skills: formData.get("weightSkills") ?? 25,
          preferred: formData.get("weightPreferred") ?? 15,
          title: formData.get("weightTitle") ?? 10,
          seniority: formData.get("weightSeniority") ?? 10,
        },
        highRelevanceThreshold: formData.get("highRelevanceThreshold") ?? 70,
      },
      scheduleEnabled: formData.get("scheduleEnabled") === "on",
      scheduleTime: String(formData.get("scheduleTime") ?? "05:00"),
      scheduleTimezone: String(formData.get("scheduleTimezone") ?? "UTC"),
    });
    revalidatePath("/scanner");
    revalidatePath("/settings/job-search");
    return success(
      saved.scheduleEnabled
        ? `Preferences saved. Daily scan at ${saved.scheduleTime} (${saved.scheduleTimezone}).`
        : "Preferences saved. Automatic scanning is off.",
    );
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The preferences could not be saved.");
  }
}

export async function saveSourceSettingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const sourceId = String(formData.get("sourceId") ?? "");
    // Each source reads the fields it knows; unknown fields are dropped by its schema.
    const config: Record<string, unknown> = {};
    if (formData.has("boards")) config.boards = parseBoards(String(formData.get("boards") ?? ""));
    if (formData.has("maxPages")) config.maxPages = formData.get("maxPages");
    if (formData.has("visaSponsorshipOnlyField")) {
      config.visaSponsorshipOnly = formData.get("visaSponsorshipOnly") === "on";
    }
    if (formData.has("category")) config.category = String(formData.get("category") ?? "");
    await saveSourceSetting(user.id, { sourceId, enabled: formData.get("enabled") === "on", config });
    revalidatePath("/settings/job-search");
    revalidatePath("/scanner");
    return success("Source settings saved.");
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The source settings could not be saved.");
  }
}

/**
 * Start a manual scan. The scan is created and locked here and runs after the
 * response, on the server; the page follows its progress and the scan keeps
 * running if the page is closed.
 */
export async function startScanAction(): Promise<ScanActionState> {
  try {
    const user = await requireUser();
    const limit = manualScanLimiter.check(user.id);
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
      return failure(
        `Too many scans in the last hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }
    const { scanId } = await startScan(user.id, "manual");
    after(() => executeScan(scanId));
    revalidatePath("/scanner");
    return { ...success("Scan started."), scanId };
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The scan could not be started.");
  }
}

export async function setListingStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await setListingStatus(user.id, id, formData.get("status"));
  revalidatePath("/scanner");
  revalidatePath(`/scanner/${id}`);
}

/** "Tailor Resume for This Job": open the existing tailoring workflow with this posting selected. */
export async function tailorListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  let destination: string;
  try {
    const { jobDescriptionId } = await prepareTailoring(user.id, id);
    const mode = formData.get("mode") === "review" ? "&mode=review" : "";
    destination = `/generate?job=${jobDescriptionId}${mode}`;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    destination = `/scanner/${id}?error=${encodeURIComponent(error.message)}`;
  }
  revalidatePath(`/scanner/${id}`);
  redirect(destination);
}

export async function importJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let listingId: string;
  try {
    const user = await requireUser();
    const result = await importJobPosting(user.id, {
      url: formData.get("url") ?? "",
      title: formData.get("title") ?? "",
      company: formData.get("company") ?? "",
      location: formData.get("location") ?? "",
      description: formData.get("description") ?? "",
    });
    listingId = result.listingId;
  } catch (error) {
    if (error instanceof AppError) return failure(error.message);
    return failure("The posting could not be imported.");
  }
  revalidatePath("/scanner");
  redirect(`/scanner/${listingId}`);
}

export async function analyzeListingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const preferences = await getJobSearchPreferences(user.id);
    await analyzeListingNow(user.id, id, preferences.rubric);
    revalidatePath(`/scanner/${id}`);
    revalidatePath("/scanner");
    return success("Analysis complete.");
  } catch (error) {
    if (error instanceof AppError || error instanceof AIProviderError) return failure(error.message);
    return failure("The listing could not be analysed.");
  }
}
