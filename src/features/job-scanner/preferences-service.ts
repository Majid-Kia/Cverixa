import "server-only";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { nextRunAfter } from "./schedule";
import {
  DEFAULT_PREFERENCES,
  jobSearchPreferencesSchema,
  rubricSchema,
  type JobSearchPreferencesInput,
} from "./schema";
import { AUTOMATIC_SOURCES, getAutomaticSource } from "./sources/registry";
import type { AutomaticSource } from "./sources/types";

export interface JobSearchPreferencesView extends JobSearchPreferencesInput {
  /** False until the owner has saved preferences once; defaults are shown until then. */
  saved: boolean;
  nextRunAt: Date | null;
  updatedAt: Date | null;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function getJobSearchPreferences(ownerId: string): Promise<JobSearchPreferencesView> {
  const row = await prisma.jobSearchPreferences.findUnique({ where: { ownerId } });
  if (!row) return { ...DEFAULT_PREFERENCES, saved: false, nextRunAt: null, updatedAt: null };
  const parsed = jobSearchPreferencesSchema.safeParse({
    countries: asStrings(row.countries),
    keywords: asStrings(row.keywords),
    workArrangements: asStrings(row.workArrangements),
    requireSponsorship: row.requireSponsorship,
    preferRelocation: row.preferRelocation,
    excludeWorkAuthRequired: row.excludeWorkAuthRequired,
    excludeNoSponsorship: row.excludeNoSponsorship,
    aiMatchingEnabled: row.aiMatchingEnabled,
    maxAnalysesPerScan: row.maxAnalysesPerScan,
    rubric: rubricSchema.catch(DEFAULT_PREFERENCES.rubric).parse(row.rubric ?? {}),
    scheduleEnabled: row.scheduleEnabled,
    scheduleTime: row.scheduleTime,
    scheduleTimezone: row.scheduleTimezone,
  });
  const data = parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  return { ...data, saved: parsed.success, nextRunAt: row.nextRunAt, updatedAt: row.updatedAt };
}

/**
 * Save the owner's preferences. The next scheduled run is recomputed from the
 * saved time and time zone whenever the schedule is enabled, and cleared when
 * it is disabled.
 */
export async function saveJobSearchPreferences(
  ownerId: string,
  input: unknown,
  now = new Date(),
): Promise<JobSearchPreferencesView> {
  const parsed = jobSearchPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("invalid_preferences", parsed.error.issues[0]?.message ?? "The preferences are not valid.");
  }
  const data = parsed.data;
  const nextRunAt = data.scheduleEnabled ? nextRunAfter(now, data.scheduleTime, data.scheduleTimezone) : null;
  const values = {
    countries: toJson(data.countries),
    keywords: toJson(data.keywords),
    workArrangements: toJson(data.workArrangements),
    requireSponsorship: data.requireSponsorship,
    preferRelocation: data.preferRelocation,
    excludeWorkAuthRequired: data.excludeWorkAuthRequired,
    excludeNoSponsorship: data.excludeNoSponsorship,
    aiMatchingEnabled: data.aiMatchingEnabled,
    maxAnalysesPerScan: data.maxAnalysesPerScan,
    rubric: toJson(data.rubric),
    scheduleEnabled: data.scheduleEnabled,
    scheduleTime: data.scheduleTime,
    scheduleTimezone: data.scheduleTimezone,
    nextRunAt,
  };
  const row = await prisma.jobSearchPreferences.upsert({
    where: { ownerId },
    update: values,
    create: { ownerId, ...values },
  });
  return { ...data, saved: true, nextRunAt: row.nextRunAt, updatedAt: row.updatedAt };
}

export interface SourceSetting {
  source: AutomaticSource;
  enabled: boolean;
  config: unknown;
}

/** Every automatic source with the owner's settings, or the source's defaults when none are saved. */
export async function getSourceSettings(ownerId: string): Promise<SourceSetting[]> {
  const rows = await prisma.jobSourceConfiguration.findMany({ where: { ownerId } });
  return AUTOMATIC_SOURCES.map((source) => {
    const row = rows.find((item) => item.sourceId === source.id);
    if (!row) return { source, enabled: source.enabledByDefault, config: source.defaultConfig };
    const parsed = source.configSchema.safeParse(row.configuration ?? {});
    return { source, enabled: row.enabled, config: parsed.success ? parsed.data : source.defaultConfig };
  });
}

export async function saveSourceSetting(
  ownerId: string,
  input: { sourceId: string; enabled: boolean; config: unknown },
): Promise<void> {
  const source = getAutomaticSource(input.sourceId);
  if (!source) throw new AppError("invalid_source", "Unknown job source.");
  const parsed = source.configSchema.safeParse(input.config ?? {});
  if (!parsed.success) {
    throw new AppError("invalid_source_config", `The settings for ${source.displayName} are not valid.`);
  }
  await prisma.jobSourceConfiguration.upsert({
    where: { ownerId_sourceId: { ownerId, sourceId: source.id } },
    update: { enabled: input.enabled, configuration: toJson(parsed.data) },
    create: { ownerId, sourceId: source.id, enabled: input.enabled, configuration: toJson(parsed.data) },
  });
}
