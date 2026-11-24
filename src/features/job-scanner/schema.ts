import { z } from "zod";
import { jobAnalysisAiOutputSchema } from "@/features/job-analysis/schema";
import {
  DEFAULT_KEYWORDS,
  LISTING_STATUSES,
  SCAN_LIMITS,
  SPONSORSHIP_STATUSES,
  SUGGESTED_COUNTRY_CODES,
  WORK_ARRANGEMENTS,
} from "./constants";
import { isCountryCode } from "./countries";
import { isValidTimeZone, TIME_PATTERN } from "./schedule";

export const RUBRIC_VERSION = 1;

const weight = z.coerce.number().int().min(0).max(100);

/**
 * Matching rubric. Each weight is the share of the Job Match Score a component
 * can contribute; components that do not apply to a listing are left out and
 * the rest are rescaled. See docs/job-scanner.md.
 */
export const rubricSchema = z.object({
  weights: z
    .object({
      mandatory: weight.default(40),
      skills: weight.default(25),
      preferred: weight.default(15),
      title: weight.default(10),
      seniority: weight.default(10),
    })
    .refine((weights) => Object.values(weights).some((value) => value > 0), "At least one weight must be above zero.")
    .default({ mandatory: 40, skills: 25, preferred: 15, title: 10, seniority: 10 }),
  /** Scores at or above this count as high-relevance matches. */
  highRelevanceThreshold: z.coerce.number().int().min(1).max(100).default(70),
});
export type Rubric = z.infer<typeof rubricSchema>;

export const DEFAULT_RUBRIC: Rubric = rubricSchema.parse({});

const stringList = (max: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(max)
    .transform((items) => [...new Map(items.map((item) => [item.toLowerCase(), item])).values()]);

export const jobSearchPreferencesSchema = z.object({
  countries: z
    .array(z.string().trim().toUpperCase())
    .max(120)
    .refine((codes) => codes.every(isCountryCode), "Unknown country selected.")
    .transform((codes) => [...new Set(codes)]),
  keywords: stringList(40, 120).refine((items) => items.length > 0, "Add at least one job title or keyword."),
  workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)).transform((items) => [...new Set(items)]),
  requireSponsorship: z.boolean(),
  preferRelocation: z.boolean(),
  excludeWorkAuthRequired: z.boolean(),
  excludeNoSponsorship: z.boolean(),
  aiMatchingEnabled: z.boolean(),
  maxAnalysesPerScan: z.coerce.number().int().min(0).max(SCAN_LIMITS.maxAnalysesPerScanCeiling),
  rubric: rubricSchema,
  scheduleEnabled: z.boolean(),
  scheduleTime: z.string().regex(TIME_PATTERN, "Use a 24-hour time such as 05:00."),
  scheduleTimezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
});
export type JobSearchPreferencesInput = z.infer<typeof jobSearchPreferencesSchema>;

export const DEFAULT_PREFERENCES: JobSearchPreferencesInput = {
  countries: [...SUGGESTED_COUNTRY_CODES],
  keywords: [...DEFAULT_KEYWORDS],
  workArrangements: ["onsite", "hybrid", "remote"],
  requireSponsorship: false,
  preferRelocation: true,
  excludeWorkAuthRequired: true,
  excludeNoSponsorship: true,
  aiMatchingEnabled: true,
  maxAnalysesPerScan: 25,
  rubric: DEFAULT_RUBRIC,
  scheduleEnabled: false,
  scheduleTime: "05:00",
  scheduleTimezone: "UTC",
};

export const listingStatusSchema = z.enum(LISTING_STATUSES);

/**
 * What the AI returns for one listing: the job-analysis output used by resume
 * tailoring, plus what the posting states about sponsorship, relocation and
 * work authorisation. Every quote is checked against the posting before use.
 */
export const jobScreeningAiOutputSchema = jobAnalysisAiOutputSchema.extend({
  sponsorship: z
    .object({
      status: z.enum(SPONSORSHIP_STATUSES).catch("unknown"),
      quotes: z.array(z.string()).default([]),
    })
    .default({ status: "unknown", quotes: [] }),
  relocation: z
    .object({ offered: z.boolean().catch(false), quotes: z.array(z.string()).default([]) })
    .default({ offered: false, quotes: [] }),
  workAuthorization: z
    .object({ required: z.boolean().catch(false), quotes: z.array(z.string()).default([]) })
    .default({ required: false, quotes: [] }),
  /** Minimum years of experience the posting explicitly asks for. */
  yearsOfExperience: z.number().min(0).max(40).nullable().catch(null).default(null),
});
export type JobScreeningAiOutput = z.infer<typeof jobScreeningAiOutputSchema>;

/** Stored with the analysis so the detail page can show what the AI quoted. */
export const screeningSignalsSchema = z.object({
  sponsorship: z.object({ status: z.enum(SPONSORSHIP_STATUSES), quotes: z.array(z.string()) }),
  relocation: z.object({ offered: z.boolean(), quotes: z.array(z.string()) }),
  workAuthorization: z.object({ required: z.boolean(), quotes: z.array(z.string()) }),
  yearsOfExperience: z.number().nullable(),
});
export type ScreeningSignals = z.infer<typeof screeningSignalsSchema>;

export const evidenceSchema = z.object({
  text: z.string(),
  basis: z.enum(["posting_text", "ai_quote", "source_flag", "relocation_signal"]),
  reading: z.enum(["offers", "excludes", "uncertain", "requires_authorization"]),
  sourceUrl: z.string(),
});

export const matchComponentSchema = z.object({
  id: z.enum(["mandatory", "skills", "preferred", "title", "seniority"]),
  label: z.string(),
  weight: z.number(),
  /** 0..1, or null when the component does not apply to this listing. */
  value: z.number().nullable(),
  /** Points contributed to the 0-100 score after rescaling. */
  points: z.number(),
  detail: z.string(),
});
export type MatchComponent = z.infer<typeof matchComponentSchema>;

export const missingQualificationSchema = z.object({
  description: z.string(),
  classification: z.enum(["mandatory", "preferred"]),
  status: z.enum(["partially_supported", "not_evidenced"]),
  note: z.string().default(""),
});
export type MissingQualification = z.infer<typeof missingQualificationSchema>;

export const matchingQualificationSchema = z.object({
  description: z.string(),
  classification: z.enum(["mandatory", "preferred"]),
  /** Where in the confirmed profile the support was found. */
  evidence: z.array(z.string()),
});
export type MatchingQualification = z.infer<typeof matchingQualificationSchema>;

export const matchBreakdownSchema = z.object({
  components: z.array(matchComponentSchema),
  matchingQualifications: z.array(matchingQualificationSchema).default([]),
  /** Work-authorisation, location or clearance constraints; reported, never scored. */
  restrictions: z.array(z.string()).default([]),
  candidateYears: z.number().nullable().default(null),
  requiredYears: z.number().nullable().default(null),
});
export type MatchBreakdown = z.infer<typeof matchBreakdownSchema>;

export const importJobSchema = z.object({
  url: z.string().trim().min(1, "Paste the link to the job posting.").max(2000),
  title: z.string().trim().min(2, "Enter the job title.").max(200),
  company: z.string().trim().min(1, "Enter the company.").max(200),
  location: z.string().trim().max(200).default(""),
  description: z
    .string()
    .trim()
    .min(50, "Paste the full job description (at least 50 characters).")
    .max(SCAN_LIMITS.maxDescriptionLength, "The job description is too long."),
});
export type ImportJobInput = z.infer<typeof importJobSchema>;
