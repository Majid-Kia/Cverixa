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

Normalized, template-independent content: `personal`, `summary {text, sourceIds}`, `sectionOrder`, `hiddenSections`, `experience[] {id, employer, title, dates, bullets[] {id, text, sourceIds, kind}}`, `skills[]`, `projects[]`, `education[]`, `certifications[]`, `languages[]`, `additionalSections[]`. `bullet.kind` is `original`, `reworded` (one source) or `composed` (several sources).

### JobAnalysis (`src/features/job-analysis/schema.ts`)

`requirements[] {id, category, description, priority, classification (mandatory|preferred), supportingText, relatedSkills[]}` plus `jobTitle`, `seniority`, `summary`.

### ChangeReport and GenerationMetadata (`src/features/resume-tailoring/schema.ts`)

The change report records summary changes, reworded/composed/removed bullets, omitted roles/projects, reordering, rejected claims with reasons, missing requirements and AI notes. Metadata records provider, model, mode, run id, profile revision id, job id, instructions, duration and timestamp.

## Evidence tracking (PRD 19.3)

1. Every generated bullet must cite `sourceIds` that exist in the confirmed profile and belong to the same role/project.
2. Numbers in a bullet must appear in the cited sources.
3. Terms from the job's `relatedSkills` and a technical vocabulary that appear in a bullet must appear in the cited sources, the role's technologies or the confirmed skills.
4. Employer, title and dates are restored from the profile if altered.
5. Skills, education, certifications and languages are copied from the confirmed profile by id.

Violations remove the claim and add a `rejectedClaims` entry; `validationStatus` becomes `passed_with_rejections` (or `failed` if nothing usable remains, in which case nothing is saved).

## Rules

- Revisions are append-only; "restore" and "duplicate" create new revisions.
- `ResumeRevision.careerProfileRevisionId` ties a resume to the exact profile version it was generated from.
- `JobDescription.structuredRequirements` is reused across generations until the text changes (NFR-004).
- Deleting a resume cascades to its revisions; deleting a job description sets `Resume.jobDescriptionId` to null and cascades generation runs.
