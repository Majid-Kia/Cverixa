import { z } from "zod";

export const JOB_ANALYSIS_SCHEMA_VERSION = 1;

export const requirementCategorySchema = z.enum([
  "technical_skill",
  "preferred_skill",
  "responsibility",
  "domain_knowledge",
  "qualification",
  "terminology",
  "soft_skill",
  "leadership",
  "restriction",
]);
export type RequirementCategory = z.infer<typeof requirementCategorySchema>;

export const requirementSchema = z.object({
  id: z.string().min(1),
  category: requirementCategorySchema,
  description: z.string().trim().min(1).max(500),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  classification: z.enum(["mandatory", "preferred"]).default("preferred"),
  /** Verbatim text from the job description supporting this requirement. */
  supportingText: z.string().trim().max(1000).default(""),
  relatedSkills: z.array(z.string().trim().min(1).max(100)).default([]),
});
export type JobRequirement = z.infer<typeof requirementSchema>;

/** Something the posting explicitly asks the applicant to submit or do when applying. */
export const applicationRequirementKindSchema = z.enum([
  "project_note",
  "portfolio",
  "cover_letter",
  "application_question",
  "other",
]);
export type ApplicationRequirementKind = z.infer<typeof applicationRequirementKindSchema>;

export const applicationRequirementSchema = z.object({
  id: z.string().min(1),
  kind: applicationRequirementKindSchema,
  description: z.string().trim().min(1).max(500),
  /** Verbatim text from the job description. Items without it are discarded. */
  supportingText: z.string().trim().max(1000).default(""),
});
export type ApplicationRequirement = z.infer<typeof applicationRequirementSchema>;

/** A stated office-attendance, location or relocation requirement. */
export const logisticsKindSchema = z.enum(["office", "relocation"]);
export type LogisticsKind = z.infer<typeof logisticsKindSchema>;

export const logisticsItemSchema = z.object({
  id: z.string().min(1),
  kind: logisticsKindSchema,
  description: z.string().trim().min(1).max(500),
  supportingText: z.string().trim().max(1000).default(""),
});
export type LogisticsItem = z.infer<typeof logisticsItemSchema>;

/**
 * Sponsorship and work eligibility. `unknown` means the posting says nothing
 * about it; it is never inferred from the location or the company.
 */
export const eligibilitySchema = z.object({
  status: z.enum(["stated", "unknown"]).default("unknown"),
  statements: z.array(z.string().trim().max(1000)).default([]),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

/** Validated, persisted analysis of a job description. */
export const jobAnalysisSchema = z.object({
  schemaVersion: z.literal(JOB_ANALYSIS_SCHEMA_VERSION).default(JOB_ANALYSIS_SCHEMA_VERSION),
  jobTitle: z.string().trim().max(200).default(""),
  seniority: z.string().trim().max(100).default(""),
  summary: z.string().trim().max(2000).default(""),
  requirements: z.array(requirementSchema).default([]),
  /** Model-extracted items, kept only when their supporting text is verbatim in the posting. */
  applicationRequirements: z.array(applicationRequirementSchema).default([]),
  logistics: z.array(logisticsItemSchema).default([]),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

/**
 * Shape the AI is asked to produce. It intentionally omits ids and the schema
 * version; the application assigns stable identifiers after validation.
 */
export const jobAnalysisAiOutputSchema = z.object({
  jobTitle: z.string().default(""),
  seniority: z.string().default(""),
  summary: z.string().default(""),
  requirements: z
    .array(
      z.object({
        category: requirementCategorySchema,
        description: z.string().min(1),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        classification: z.enum(["mandatory", "preferred"]).default("preferred"),
        supportingText: z.string().default(""),
        relatedSkills: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  applicationRequirements: z
    .array(
      z.object({
        kind: applicationRequirementKindSchema.catch("other"),
        description: z.string().min(1),
        supportingText: z.string().default(""),
      }),
    )
    .default([]),
  logistics: z
    .array(
      z.object({
        kind: logisticsKindSchema.catch("office"),
        description: z.string().min(1),
        supportingText: z.string().default(""),
      }),
    )
    .default([]),
});
export type JobAnalysisAiOutput = z.infer<typeof jobAnalysisAiOutputSchema>;

export const jobDescriptionInputSchema = z.object({
  originalText: z
    .string()
    .trim()
    .min(50, "Paste the full job description (at least 50 characters).")
    .max(50_000, "Job description is too long (50,000 character limit)."),
  title: z.string().trim().max(200).optional().default(""),
  company: z.string().trim().max(200).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  sourceUrl: z.string().trim().max(1000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});
export type JobDescriptionInput = z.infer<typeof jobDescriptionInputSchema>;
