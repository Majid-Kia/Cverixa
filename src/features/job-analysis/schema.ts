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

/** Validated, persisted analysis of a job description. */
export const jobAnalysisSchema = z.object({
  schemaVersion: z.literal(JOB_ANALYSIS_SCHEMA_VERSION).default(JOB_ANALYSIS_SCHEMA_VERSION),
  jobTitle: z.string().trim().max(200).default(""),
  seniority: z.string().trim().max(100).default(""),
  summary: z.string().trim().max(2000).default(""),
  requirements: z.array(requirementSchema).default([]),
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
