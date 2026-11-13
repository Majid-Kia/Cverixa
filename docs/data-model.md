# Data model

Schema: [prisma/schema.prisma](../prisma/schema.prisma). Migrations: `prisma/migrations`. All ids are cuid strings; all JSON columns hold schema-versioned structures validated with Zod before writing and after reading.

## Entities

| Entity                    | Purpose                             | Notes                                                                                                                                                    |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                    | The owner account                   | Single user in the MVP; `ownerId` on every entity keeps the multi-user boundary ready                                                                    |
| `Session`                 | Login session                       | Stores a SHA-256 hash of the cookie token, expiry, cascade on user delete                                                                                |
| `CareerProfile`           | The Master Career Profile container | `currentRevisionId` points to the active revision                                                                                                        |
| `CareerProfileRevision`   | Immutable profile snapshot          | `structuredData` = `CareerProfileData` (schemaVersion 1); `confirmedAt` set only when the owner confirmed                                                |
| `ImportSession`           | Pending import awaiting review      | Draft `structuredData` with every entry `status: imported`, plus `warnings`; deleted on confirm/discard                                                  |
| `JobDescription`          | Pasted job posting                  | `structuredRequirements` = `JobAnalysis`; cleared when the text changes; provider/model/analysedAt recorded                                              |
| `Resume`                  | A resume for one job (or manual)    | Links `careerProfileId` and optional `jobDescriptionId`                                                                                                  |
| `ResumeRevision`          | Immutable resume version            | `content` = `ResumeContent`, `templateId`, `pageFormat`, `careerProfileRevisionId`, `changeReport`, `generationMetadata`, `validationStatus`             |
| `GenerationRun`           | One tailoring execution             | provider, model, mode, template, status (`running`, `awaiting_review`, `completed`, `failed`), `failureReason`, Review Mode `proposal` state, result ids |
| `AIProviderConfiguration` | Non-secret provider preferences     | `providerId`, `modelId`, `isDefault`, `configuration` (timeout). API keys are never stored                                                               |

## Structured content

### CareerProfileData (`src/features/career-profile/schema.ts`)

Sections: `personal`, `summary`, `experience[]`, `skills[]`, `projects[]`, `education[]`, `certifications[]`, `languages[]`, `additionalSections[]`. Every entry has a stable `id` and a `status`:

- `confirmed` – verified by the owner; the only status eligible as evidence for tailoring.
- `imported` – extracted from a document, awaiting review.
- `ai_suggested` – proposed by AI (reserved; never written by the MVP pipeline).

Experience entries contain `responsibilities[] {id,text}`, `achievements[] {id,text,metrics[]}` and `technologies[]`. Project entries contain `outcomes[] {id,text}`. These ids are the **evidence references** cited by generated bullets.

### ResumeContent (`src/types/resume-content.ts`)

Normalized, template-independent content: `personal`, `summary {text, sourceIds}`, `sectionOrder`, `hiddenSections`, `experience[] {id, employer, title, dates, bullets[] {id, text, sourceIds, kind}}`, `skills[]`, `projects[]`, `education[]`, `certifications[]`, `languages[]`, `additionalSections[]`. `bullet.kind` is `original`, `reworded` (one source), `composed` (several sources) or `user_provided` (the owner's answer to the brief's question, added as written). `featured` (nullable) is the selected project shown directly under the summary: `{entryId, entryKind, title, subtitle, startDate, endDate, description, technologies, bullets[]}`. It always comes from one confirmed role or project, names that source, and its bullets are moved out of the source entry rather than repeated.

### JobAnalysis (`src/features/job-analysis/schema.ts`)

`requirements[] {id, category, description, priority, classification (mandatory|preferred), supportingText, relatedSkills[]}` plus `jobTitle`, `seniority`, `summary`, and model-extracted `applicationRequirements[]` and `logistics[]`, which are kept only when their `supportingText` is verbatim in the posting.

### ChangeReport and GenerationMetadata (`src/features/resume-tailoring/schema.ts`)

The change report records summary changes, reworded/composed/removed bullets, omitted roles/projects, reordering, rejected claims with reasons, missing requirements and AI notes. Metadata records provider, model, mode, run id, profile revision id, job id, instructions, duration and timestamp.

### ApplicationBrief (`src/features/resume-tailoring/schema.ts`)

Worked out before drafting by `planApplication` (`application-brief.ts`), stored with the Review Mode state and in the change report:

- `criteria[]`: the role's screening criteria (mandatory or high-priority requirements), each with its evidence across every role and project (`evidence[] {id, label, source, basis}`), a status and what is still `missing`.
- `featured`: the strongest supported project and how it reaches page one (`selected_project` or `lead_role`).
- `question`: at most one optional question about a detail the featured project lacks.
- `applicationRequirements[]`, `logistics[]` (office, relocation) and `eligibility` (`stated` or `unknown`), quoted from the posting by `buildApplicationContext` (`src/features/job-analysis/application-context.ts`). Sponsorship and eligibility are `unknown` unless the posting states them.
- `headlineIssues[]`: contradictions between the headline and the profile.

## Evidence tracking (PRD 19.3)

1. Every generated bullet must cite `sourceIds` that exist in the confirmed profile and belong to the same role/project.
2. Numbers in a bullet must appear in the cited sources.
3. Terms from the job's `relatedSkills` and a technical vocabulary that appear in a bullet must appear in the cited sources, the role's technologies or the confirmed skills.
4. Employer, title and dates are restored from the profile if altered.
5. Skills, education, certifications and languages are copied from the confirmed profile by id.
6. Customer or user contact, usage or adoption measurement, changes made after feedback, design ownership and AI features are **evidence signals** (`signals.ts`): a criterion that asks for one is not fully supported, and a generated bullet or summary that states one is rejected, unless a cited confirmed statement states it outright. They are never inferred from related experience.
7. The model's own evidence plan (`evidencePlan` in the tailoring output) is reconciled, not trusted: ids must exist, featured-project statements must belong to the proposed entry, a proposed title must be made of the cited statements' words, and rule 6 still applies.
8. When the model omits a role or the featured project, or every rewrite for a role is rejected, the original confirmed statements are used.

Violations remove the claim and add a `rejectedClaims` entry; `validationStatus` becomes `passed_with_rejections` (or `failed` if nothing usable remains, in which case nothing is saved).

## Rules

- Revisions are append-only; "restore" and "duplicate" create new revisions.
- `ResumeRevision.careerProfileRevisionId` ties a resume to the exact profile version it was generated from.
- `JobDescription.structuredRequirements` is reused across generations until the text changes (NFR-004).
- Deleting a resume cascades to its revisions; deleting a job description sets `Resume.jobDescriptionId` to null and cascades generation runs.
