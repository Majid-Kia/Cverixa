import { z } from "zod";
import { resumeSectionKeySchema } from "@/types/resume-content";

/** Evidence status of a job requirement against confirmed career facts (PRD 9.2 stage 2). */
export const evidenceStatusSchema = z.enum(["supported", "partially_supported", "not_evidenced"]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const evidenceRefSchema = z.object({
  /** Id of the profile entry (experience, project, skill, achievement, statement). */
  id: z.string(),
  kind: z.enum([
    "experience",
    "achievement",
    "responsibility",
    "project",
    "outcome",
    "skill",
    "certification",
    "education",
  ]),
  label: z.string(),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const requirementMatchSchema = z.object({
  requirementId: z.string(),
  description: z.string(),
  classification: z.enum(["mandatory", "preferred"]),
  status: evidenceStatusSchema,
  evidence: z.array(evidenceRefSchema).default([]),
  missing: z.string().default(""),
});
export type RequirementMatch = z.infer<typeof requirementMatchSchema>;

export const evidenceMapSchema = z.object({
  matches: z.array(requirementMatchSchema),
});
export type EvidenceMap = z.infer<typeof evidenceMapSchema>;

/**
 * What the AI returns for stage 4 (generate tailored content). It only selects,
 * orders and rewords; every bullet must cite confirmed source ids.
 */
export const tailoringAiOutputSchema = z.object({
  summary: z.object({
    text: z.string().default(""),
    sourceIds: z.array(z.string()).default([]),
  }),
  experience: z
    .array(
      z.object({
        id: z.string(),
        bullets: z
          .array(
            z.object({
              text: z.string(),
              sourceIds: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        id: z.string(),
        bullets: z
          .array(
            z.object({
              text: z.string(),
              sourceIds: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  /** Skill ids in priority order. Unknown ids are ignored. */
  skillIds: z.array(z.string()).default([]),
  sectionOrder: z.array(z.string()).default([]),
  changeNotes: z.array(z.string()).default([]),
});
export type TailoringAiOutput = z.infer<typeof tailoringAiOutputSchema>;

export const rejectedClaimSchema = z.object({
  location: z.string(),
  text: z.string(),
  reason: z.string(),
});
export type RejectedClaim = z.infer<typeof rejectedClaimSchema>;

export const changeReportSchema = z.object({
  summaryChanged: z.boolean().default(false),
  rewordedBullets: z.number().int().nonnegative().default(0),
  composedBullets: z.number().int().nonnegative().default(0),
  removedBullets: z.array(z.string()).default([]),
  omittedExperience: z.array(z.string()).default([]),
  omittedProjects: z.array(z.string()).default([]),
  reorderedSkills: z.boolean().default(false),
  reorderedSections: z.boolean().default(false),
  sectionOrder: z.array(resumeSectionKeySchema).default([]),
  rejectedClaims: z.array(rejectedClaimSchema).default([]),
  missingRequirements: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type ChangeReport = z.infer<typeof changeReportSchema>;

export const validationStatusSchema = z.enum(["passed", "passed_with_rejections", "failed"]);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const generationModeSchema = z.enum(["quick", "review"]);
export type GenerationMode = z.infer<typeof generationModeSchema>;

export const generationMetadataSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  mode: generationModeSchema,
  generationRunId: z.string().optional(),
  careerProfileRevisionId: z.string().optional(),
  jobDescriptionId: z.string().optional(),
  userInstructions: z.string().default(""),
  durationMs: z.number().nonnegative().optional(),
  generatedAt: z.string(),
});
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;

/** Single proposed change shown in Review Mode. */
export const proposalSchema = z.object({
  id: z.string(),
  kind: z.enum(["summary", "experience_bullets", "project_bullets", "skills", "section_order"]),
  entryId: z.string().optional(),
  label: z.string(),
  original: z.array(z.string()),
  proposed: z.array(z.string()),
  /** Source ids per proposed line (parallel to `proposed`). */
  proposedSourceIds: z.array(z.array(z.string())).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposalDecisionSchema = z.object({
  proposalId: z.string(),
  decision: z.enum(["accept", "reject"]),
  /** Optional user-edited replacement lines (same ordering as `proposed`). */
  editedLines: z.array(z.string()).optional(),
});
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;
