import { z } from "zod";
import {
  applicationRequirementSchema,
  eligibilitySchema,
  logisticsItemSchema,
  requirementCategorySchema,
} from "@/features/job-analysis/schema";
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
  /** Role or project the evidence belongs to ("" for skills, education, certifications). */
  parentId: z.string().default(""),
  /** Where the evidence comes from, with dates, e.g. "Frontend Developer at Zoomit (2016 - 2018)". */
  source: z.string().default(""),
  /** `model` when the AI proposed the link and the application verified the id exists. */
  basis: z.enum(["term", "model"]).default("term"),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const requirementMatchSchema = z.object({
  requirementId: z.string(),
  description: z.string(),
  classification: z.enum(["mandatory", "preferred"]),
  status: evidenceStatusSchema,
  evidence: z.array(evidenceRefSchema).default([]),
  missing: z.string().default(""),
  /** Ids of evidence signals the criterion asks for that no confirmed statement shows. */
  missingSignals: z.array(z.string()).default([]),
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
  /**
   * Filled in before the draft: which confirmed statements support each
   * screening criterion, which project to bring forward, and at most one
   * question. Every id is verified by the application; an empty `entryId`
   * means "none".
   */
  evidencePlan: z
    .object({
      criteria: z
        .array(
          z.object({
            requirementId: z.string(),
            sourceIds: z.array(z.string()).default([]),
            gap: z.string().default(""),
          }),
        )
        .default([]),
      featuredProject: z
        .object({
          entryId: z.string().default(""),
          sourceIds: z.array(z.string()).default([]),
          title: z.string().default(""),
          reason: z.string().default(""),
        })
        .default({ entryId: "", sourceIds: [], title: "", reason: "" }),
      question: z
        .object({ entryId: z.string().default(""), text: z.string().default("") })
        .default({ entryId: "", text: "" }),
    })
    .default({
      criteria: [],
      featuredProject: { entryId: "", sourceIds: [], title: "", reason: "" },
      question: { entryId: "", text: "" },
    }),
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

/** A screening criterion with the evidence found for it across the whole profile. */
export const briefCriterionSchema = requirementMatchSchema.extend({
  category: requirementCategorySchema,
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});
export type BriefCriterion = z.infer<typeof briefCriterionSchema>;

/** The project brought forward to the first page and how. */
export const featuredSelectionSchema = z.object({
  entryId: z.string(),
  entryKind: z.enum(["experience", "project"]),
  title: z.string().default(""),
  /** How to refer to it in a sentence, e.g. "the fraud-detection portal". */
  reference: z.string().default(""),
  /** Role or project it is taken from, with dates. */
  source: z.string().default(""),
  /** Ids of the confirmed statements that describe it (at most three). */
  sourceIds: z.array(z.string()).default([]),
  /** `selected_project`: a short entry under the summary. `lead_role`: already in the first role, kept at its top. */
  placement: z.enum(["selected_project", "lead_role"]),
  /** Criteria it speaks to, in the posting's words. */
  criteria: z.array(z.string()).default([]),
  basis: z.enum(["term", "model"]).default("term"),
});
export type FeaturedSelection = z.infer<typeof featuredSelectionSchema>;

/** The one optional question asked about a relevant project. */
export const clarifyingQuestionSchema = z.object({
  text: z.string(),
  hint: z.string().default(""),
  entryId: z.string(),
  entryKind: z.enum(["experience", "project"]),
  /** Role or project the answer will be attached to. */
  entryLabel: z.string(),
  /** Evidence signal the question is about ("" when the AI phrased it). */
  signal: z.string().default(""),
  /** The criterion that would be strengthened. */
  criterion: z.string().default(""),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/**
 * Everything worked out before drafting and shown next to the review: the
 * role's screening criteria with their evidence, what the posting asks the
 * applicant to submit, stated office/relocation requirements, and whether
 * sponsorship or eligibility is mentioned at all.
 */
export const applicationBriefSchema = z.object({
  criteria: z.array(briefCriterionSchema).default([]),
  featured: featuredSelectionSchema.nullable().default(null),
  question: clarifyingQuestionSchema.nullable().default(null),
  applicationRequirements: z.array(applicationRequirementSchema).default([]),
  logistics: z.array(logisticsItemSchema).default([]),
  eligibility: eligibilitySchema.default({ status: "unknown", statements: [] }),
  /** Obvious mismatches between the headline and the rest of the profile. */
  headlineIssues: z.array(z.string()).default([]),
});
export type ApplicationBrief = z.infer<typeof applicationBriefSchema>;

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
  /** Absent on versions generated before the application brief existed. */
  brief: applicationBriefSchema.nullable().default(null),
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
  kind: z.enum(["summary", "featured_project", "experience_bullets", "project_bullets", "skills", "section_order"]),
  entryId: z.string().optional(),
  label: z.string(),
  original: z.array(z.string()),
  proposed: z.array(z.string()),
  /** Source ids per proposed line (parallel to `proposed`). */
  proposedSourceIds: z.array(z.array(z.string())).default([]),
  /** Short explanation shown with the proposal (for example where moved bullets went). */
  note: z.string().default(""),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposalDecisionSchema = z.object({
  proposalId: z.string(),
  decision: z.enum(["accept", "reject"]),
  /** Optional user-edited replacement lines (same ordering as `proposed`). */
  editedLines: z.array(z.string()).optional(),
});
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;

/** Optional answer to the brief's question, given in Review Mode. */
export const reviewAnswerSchema = z.object({
  text: z.string().trim().max(1000).default(""),
  /** Also store the answer on the role or project in the Master Career Profile. */
  saveToProfile: z.boolean().default(false),
});
export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>;
