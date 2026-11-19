# Data model

Schema: [prisma/schema.prisma](../prisma/schema.prisma). Migrations: `prisma/migrations`. All ids are cuid strings; all JSON columns hold schema-versioned structures validated with Zod before writing and after reading.

## Entities

| Entity                    | Purpose                             | Notes                                                                                                                                                                                                                                |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                    | The owner account                   | Single user in the MVP; `ownerId` on every entity keeps the multi-user boundary ready                                                                                                                                                |
| `Session`                 | Login session                       | Stores a SHA-256 hash of the cookie token, expiry, cascade on user delete                                                                                                                                                            |
| `CareerProfile`           | The Master Career Profile container | `currentRevisionId` points to the active revision                                                                                                                                                                                    |
| `CareerProfileRevision`   | Immutable profile snapshot          | `structuredData` = `CareerProfileData` (schemaVersion 1); `confirmedAt` set only when the owner confirmed                                                                                                                            |
| `ImportSession`           | Pending import awaiting review      | Draft `structuredData` with every entry `status: imported`, plus `warnings`; deleted on confirm/discard                                                                                                                              |
| `JobDescription`          | Pasted job posting                  | `structuredRequirements` = `JobAnalysis`; cleared when the text changes; provider/model/analysedAt recorded                                                                                                                          |
| `Resume`                  | A resume for one job (or manual)    | Links `careerProfileId` and optional `jobDescriptionId`; `applicationStatus` (`pending`, `interview`, `rejected`; default `pending`) is set by the owner in the resume list and shared by all versions                               |
| `ResumeRevision`          | Immutable resume version            | `content` = `ResumeContent`, `templateId`, `pageFormat`, `careerProfileRevisionId`, `changeReport`, `generationMetadata`, `validationStatus`                                                                                         |
| `GenerationRun`           | One tailoring execution             | provider, model, mode, template, status (`running`, `awaiting_review`, `completed`, `failed`), `failureReason`, Review Mode `proposal` state, result ids                                                                             |
| `CoverLetter`             | The cover letter for one job        | One per `JobDescription` (unique `jobDescriptionId`, deleted with the job); `body` is plain text the owner edits; `report` = `CoverLetterReport`; `edited`, `generatedAt`, provider and model recorded; generating again replaces it |
| `AIProviderConfiguration` | Non-secret provider preferences     | `providerId`, `modelId`, `isDefault`, `configuration` (timeout). API keys are never stored                                                                                                                                           |

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

### Cover letter (`src/features/cover-letter/`)

A separate flow from resume tailoring, started with "Generate cover letter" on the job page. It reuses the application plan (`planApplication`) for the screening criteria, their evidence and the featured project, and asks the model (task `cover_letter`) for a greeting and paragraphs that cite profile statement ids. `buildCoverLetter` then checks every sentence against the confirmed profile with the same rules as resume claims (`checkTextAgainstSources`): numbers and named technologies must appear in the profile, and customer contact, usage tracking, design ownership or AI work must be stated by it. A sentence that fails is removed and listed in `report.removed`; criteria the profile does not fully support are listed in `report.notClaimed` and are not claimed; a greeting keeps a name only when the posting contains it. The application adds the sign-off and the owner's name. If fewer than two paragraphs survive, nothing is stored and the previous letter is kept. The owner's edits are saved as written and are not checked. The PDF (`/api/cover-letters/[id]/pdf`) adds the contact header from the profile and the current date. The Master Career Profile is never changed.

## Evidence tracking (PRD 19.3)

1. Every generated bullet must cite `sourceIds` that exist in the confirmed profile and belong to the same role/project.
2. Numbers in a bullet must appear in the cited sources.
3. Terms from the job's `relatedSkills` and a technical vocabulary that appear in a bullet must appear in the cited sources, the role's technologies or the confirmed skills.
4. Employer, title and dates are restored from the profile if altered.
5. Skills, education, certifications and languages are copied from the confirmed profile by id.
6. Customer or user contact, usage or adoption measurement, changes made after feedback, design ownership and AI features are **evidence signals** (`signals.ts`): a criterion that asks for one is not fully supported, and a generated bullet or summary that states one is rejected, unless a cited confirmed statement states it outright. They are never inferred from related experience.
7. The model's own evidence plan (`evidencePlan` in the tailoring output) is reconciled, not trusted: ids must exist, featured-project statements must belong to the proposed entry, a proposed title must be made of the cited statements' words, and rule 6 still applies.
8. When the model omits a role or the featured project, or every rewrite for a role is rejected, the original confirmed statements are used.

**Opt-in exception: covering gaps.** When the owner ticks "Cover missing requirements" (`fillGaps`), requirements that are not fully supported (no evidence, or only partial evidence) are covered with content that is not in the profile (`gap-fill.ts`): the posting's own skill names are added to Skills (`supplied: true`), and for experience requirements one model-written bullet (`kind: supplied`, no sources, no numbers or links) is added to a role, or takes the place of a routine responsibility that relates to nothing in the job (at most two per role, never an achievement). Degrees, certifications, licences and eligibility are never supplied; they are listed in `changeReport.supplied.credentials` for the owner to add to the profile if true. They are listed in Review Mode (`credentialGaps`, whether or not gaps are being covered), where the owner may enter the ones they hold (`owned-credentials.ts`): every field starts empty, the entry is placed as typed under Certifications, Education or an "Additional information" section of that resume, and it is written to the Master Career Profile as a new confirmed revision only when the owner leaves that option ticked. Limits: 20 skills and 8 bullets per resume. Supplied content is planned after validation, never mixed into validated content, offered as separate proposals in Review Mode, listed in `changeReport.supplied`, and the version is saved with `validationStatus: with_additions`. The Master Career Profile is not changed.

Violations remove the claim and add a `rejectedClaims` entry; `validationStatus` becomes `passed_with_rejections` (or `failed` if nothing usable remains, in which case nothing is saved).

## Rules

- Revisions are append-only; "restore" and "duplicate" create new revisions.
- `ResumeRevision.careerProfileRevisionId` ties a resume to the exact profile version it was generated from.
- `JobDescription.structuredRequirements` is reused across generations until the text changes (NFR-004).
- Deleting a resume cascades to its revisions; deleting a job description sets `Resume.jobDescriptionId` to null and cascades generation runs.
