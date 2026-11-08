# Cverixa — Product Requirements Document

**Version:** 1.0  
**Status:** Ready for MVP Implementation  
**Product Type:** AI-Powered Resume Builder & Job-Specific Resume Tailoring Platform  
**Primary Platform:** Web Application  
**Primary Language:** English  
**GitHub Repository:** https://github.com/Majid-Kia/Cverixa

---

# 1. Executive Summary

Cverixa is an AI-powered resume creation and optimization application that helps job seekers create professional resumes and automatically tailor them to specific job descriptions.

The product addresses two major problems:

1. Traditional resume builders often provide visually inconsistent, poorly formatted, or insufficiently customizable PDF outputs.
2. Manually customizing a resume for every job application is repetitive and time-consuming.

Cverixa combines a structured master resume, AI-powered job description analysis, automatic content tailoring, and deterministic PDF rendering.

A user should be able to upload an existing resume once, maintain a comprehensive professional profile, paste a job description, and generate a tailored, professionally formatted resume with minimal manual intervention.

**Primary product promise:**

> Upload your resume once. Tailor it to any job description. Generate a professional, job-specific resume in minutes.

The system must optimize relevance and clarity without inventing professional experience, skills, certifications, education, or achievements.

Cverixa must be independently usable without purchasing a subscription to third-party resume-building services.

# 2. Product Objectives

## 2.1 Primary Objectives

- Allow users to import existing resumes in PDF or DOCX format.
- Support manual resume creation and editing.
- Maintain one reusable Master Career Profile.
- Analyze job descriptions using AI.
- Automatically tailor resumes to job requirements.
- Generate professional, selectable-text PDFs.
- Support multiple resume templates.
- Ensure consistent typography, layout, spacing, and pagination.
- Allow AI provider selection.
- Support both cloud AI APIs and local AI models.
- Minimize the time needed to prepare each job application.
- Maintain a history of generated resumes and their associated job descriptions.

## 2.2 Success Metrics

The following are MVP validation targets, not guaranteed business outcomes:

| Metric                      | Target                                                         |
| --------------------------- | -------------------------------------------------------------- |
| Resume import               | Common text-based PDF and DOCX resumes successfully imported   |
| Manual modification         | Not required for a typical successful Quick Generate flow      |
| User input for tailoring    | One Job Description                                            |
| Supported AI providers      | OpenAI, Anthropic, Ollama                                      |
| Resume templates            | Three                                                          |
| PDF text extraction         | 100% of visible textual content extractable in automated tests |
| Fabricated qualifications   | Zero in approved acceptance-test scenarios                     |
| Critical layout defects     | Zero in approved PDF fixtures                                  |
| Default Quick Generate flow | One generation action after configuration                      |
| Resume version history      | Available for every successfully saved generated resume        |

A measurable improvement in interview outcomes is a potential long-term goal but is not guaranteed by the product.

# 3. Target Users

## 3.1 Primary User

An experienced professional applying to multiple positions who requires:

- High-quality resumes.
- Fast job-specific customization.
- Minimal manual editing.
- Accurate representation of experience.
- Predictable PDF output.

The initial product must work particularly well for software engineers, technical leads, architects, and other technology professionals.

However, its data model must not be restricted to technology careers.

## 3.2 User Model

**MVP:** Single-user application.

**Future:** Multi-user SaaS platform.

Architect the application with a clear ownership boundary around career profiles, resumes, job descriptions, documents, and AI settings.

Do not implement public registration, billing, subscriptions, team accounts, or multi-user administration in the MVP.

Because internet deployment is supported, the MVP must not expose private resumes or AI credentials through an unauthenticated public interface.

# 4. Scope

## 4.1 MVP In Scope

- Owner authentication.
- Resume import (PDF and DOCX).
- Manual profile creation.
- Structured Master Career Profile.
- Career profile editing.
- Job Description text input.
- Job Description analysis.
- AI-powered resume tailoring.
- Quick Generate mode.
- Review Mode.
- Three professional resume templates.
- Inter font in all generated PDFs.
- Live resume preview.
- PDF export.
- Resume version history.
- AI provider settings.
- OpenAI, Anthropic, and Ollama integration.
- Secure provider credential management.
- Job-to-resume traceability.
- Basic relevance and coverage reporting.
- Responsive dashboard.
- Automated testing and GitHub CI.

## 4.2 Out of Scope for MVP

- Automatic job applications.
- LinkedIn scraping or browser automation.
- Job board integrations.
- LinkedIn profile import.
- Cover letter generation.
- Interview coaching.
- Payment processing.
- Subscription management.
- Public user registration.
- Multi-user collaboration.
- Automatic translation.
- Image-based resume OCR.
- AI-generated professional achievements without evidence.
- Direct integration with paid resume builder services.
- Guaranteed ATS scores or interview probability predictions.

These features may be considered after the MVP.

# 5. Core Product Principles

## 5.1 Truthfulness First

AI must never fabricate professional facts.

Allowed transformations include:

- Rewriting existing achievements.
- Improving grammar and clarity.
- Reordering relevant experience.
- Highlighting verified skills.
- Reducing irrelevant information.
- Combining redundant statements without losing their meaning.
- Selecting the most relevant achievements.
- Converting descriptions into clearer action-oriented bullet points.

Disallowed transformations include:

- Inventing employers.
- Changing employment dates.
- Inventing job titles.
- Claiming technologies the user has never used.
- Inventing numerical results.
- Changing seniority without supporting evidence.
- Creating unverified degrees or certifications.
- Turning a team achievement into individual ownership without evidence.

If relevant information is missing, report a gap instead of inventing an answer.

## 5.2 Master Profile as Source of Truth

The Master Career Profile is the canonical representation of the user's professional history.

Generated resumes are tailored snapshots derived from the Master Career Profile.

AI-generated changes must not silently overwrite the master profile.

## 5.3 Content and Presentation Are Separate

Resume content must be stored as structured data.

Templates must operate as presentation layers.

Changing a template must not modify the underlying resume content.

## 5.4 Deterministic Rendering

The AI creates structured resume content, not PDF layout instructions.

A dedicated rendering engine controls typography, margins, spacing, page breaks, and PDF export.

## 5.5 Provider Independence

AI workflows must not depend on a single model vendor.

Changing the selected provider must not require modifications to the resume data model or core business logic.

# 6. Resume Import

**Requirement ID: FR-001**

## Description

Users can import an existing resume to initialize their Master Career Profile.

### Supported Inputs

- PDF with extractable text.
- DOCX.
- Manual entry.

### Expected Workflow

1. User opens the Import Resume screen.
2. User uploads a supported file.
3. The system validates file extension, size, and actual file content.
4. The system extracts raw text and document structure.
5. AI converts extracted information into a predefined structured schema.
6. The system validates the result.
7. The user reviews and corrects extracted fields.
8. The user confirms the imported profile.
9. The system saves the Master Career Profile.

### Import Requirements

- Preserve original employment dates.
- Preserve employer names.
- Preserve project descriptions.
- Preserve skills.
- Preserve original achievement metrics.
- Preserve user-provided links.
- Preserve languages and proficiency levels.
- Do not silently assume missing values.
- Report uncertain or unrecognized information.
- Allow manual correction before confirmation.

### Error Handling

Display actionable errors for:

- Corrupted files.
- Unsupported formats.
- Password-protected PDFs.
- Scanned PDFs without extractable text.
- Empty documents.
- Oversized uploads.
- Unreadable or ambiguous sections.
- AI parsing failures.

### MVP Limits

- Maximum upload size: 10 MB.
- Maximum document length: 10 pages.
- Supported file types: `.pdf`, `.docx`.

Use configurable limits rather than hardcoding them throughout the application.

**Acceptance Criteria**

- A valid text-based PDF can be converted into editable structured content.
- A valid DOCX can be converted into editable structured content.
- The original file is not required for later resume generation.
- Users can correct incorrectly parsed information.
- No imported profile becomes canonical until user confirmation.

# 7. Master Career Profile

**Requirement ID: FR-002**

The user must be able to maintain a complete career history independently from any generated resume.

## 7.1 Required Data Sections

### Personal Information

- Full name.
- Professional headline.
- Email.
- Phone.
- Location.
- LinkedIn URL.
- GitHub URL.
- Portfolio URL.
- Other professional links.

### Professional Summary

- Full-length summary.
- Key strengths.
- Areas of specialization.
- Career highlights.

### Work Experience

Each entry contains:

- Stable identifier.
- Employer name.
- Job title.
- Location.
- Employment type (optional).
- Start date.
- End date or Present.
- Responsibility statements.
- Achievement statements.
- Technologies.
- Verified metrics.
- Source references where available.

### Skills

- Skill name.
- Category.
- Optional proficiency level.
- Optional evidence references.

### Projects

- Project name.
- Description.
- Role.
- Technologies.
- Verified outcomes.
- Project URL.
- Repository URL where applicable.

### Education

- Institution.
- Degree.
- Field of study.
- Start and end dates.
- Relevant details.

### Certifications

- Certification name.
- Issuer.
- Date.
- Credential URL where available.

### Languages

- Language.
- Proficiency.

### Additional Sections

Allow optional structured sections for:

- Publications.
- Awards.
- Volunteer work.
- Open-source contributions.
- Other career-relevant information.

## 7.2 Data Integrity

Every entry must have a stable identifier.

The master profile must support editing, reordering, adding, and deleting entries.

Professional achievements should support optional structured evidence and metrics so that the AI can trace content to verified facts.

The system must distinguish:

- User-confirmed facts.
- Imported but unconfirmed facts.
- AI suggestions.

Only user-confirmed facts should be eligible as authoritative evidence for tailoring.

# 8. Job Description Management

**Requirement ID: FR-003**

Users can provide a job description by pasting text into the application.

## 8.1 Inputs

Required:

- Job description text.

Optional:

- Company name.
- Job title.
- Job posting URL.
- Location.
- Notes.

The URL is informational in the MVP; automatic web fetching is not required.

## 8.2 AI Job Analysis

Extract:

- Job title.
- Required technical skills.
- Preferred skills.
- Expected seniority.
- Core responsibilities.
- Domain knowledge.
- Required qualifications.
- Important terminology.
- Relevant soft skills.
- Leadership requirements.
- Explicit restrictions or mandatory qualifications.

Differentiate mandatory requirements from preferences.

Do not assume a keyword is mandatory merely because it appears frequently.

## 8.3 Structured Analysis

The system must store the extracted requirements using a validated schema.

Every requirement should have:

- Identifier.
- Category.
- Description.
- Priority.
- Mandatory/preferred classification.
- Original supporting text.
- Optional supporting skills.

AI output must be treated as untrusted structured data and validated before persistence.

# 9. AI Resume Tailoring Engine

**Requirement ID: FR-004**

This is the primary differentiating capability of Cverixa.

## 9.1 Inputs

- Confirmed Master Career Profile.
- Job Description analysis.
- Selected AI provider.
- Selected AI model.
- Selected resume template.
- User-selected generation mode.
- Optional user instructions.

## 9.2 Tailoring Pipeline

### Stage 1 — Understand Job Requirements

Extract structured job requirements from the provided description.

### Stage 2 — Match Career Evidence

Map job requirements to verified career facts.

Classify each requirement as:

- Supported.
- Partially supported.
- Not evidenced.

### Stage 3 — Prioritize Information

Determine the professional experiences, achievements, projects, and skills most relevant to the position.

### Stage 4 — Generate Tailored Content

Produce:

- Tailored professional summary.
- Prioritized experience bullet points.
- Relevant skill ordering.
- Relevant project selection.
- Appropriate section ordering.

### Stage 5 — Validate Factual Integrity

Verify each generated claim against confirmed source facts.

Use structured evidence references for changed or newly composed claims.

No unsupported claim may be included automatically.

A missing evidence reference or failed validation must block the affected claim from finalization until corrected or explicitly resolved using confirmed information.

### Stage 6 — Produce a Change Report

Describe meaningful modifications:

- Reworded bullets.
- Removed irrelevant content.
- Reordered experiences.
- Added verified skills already present in the master profile.
- Changed summary emphasis.
- Omitted content due to space or relevance.

### Stage 7 — Generate the Resume

Pass the validated structured content into the selected template.

### Stage 8 — Quality Validation

Validate the generated document for content integrity, layout problems, and text extraction.

## 9.3 Keyword Optimization

The system should naturally incorporate relevant terminology when supported by actual experience.

Do not:

- Keyword-stuff the resume.
- Repeat skills unnaturally.
- Add hidden text.
- Insert unsupported qualifications.
- Manufacture relevance scores.

## 9.4 AI Behavior

Prefer concise, achievement-oriented writing.

Use strong verbs where appropriate.

Preserve verified numerical metrics.

Avoid generic, exaggerated, or promotional language.

Do not unnecessarily rewrite already strong and relevant content.

Maintain a professional international English writing style.

# 10. Generation Modes

## 10.1 Quick Generate

**Requirement ID: FR-005**

Optimized for minimum user interaction.

### Workflow

1. Select the Master Career Profile.
2. Paste or select a Job Description.
3. Choose a template and AI provider, using saved defaults.
4. Click **Generate Resume**.
5. AI performs analysis, tailoring, and validation.
6. The app renders the result.
7. User reviews the preview.
8. User downloads the PDF or makes optional edits.

### Requirements

- No mandatory step-by-step approvals.
- Report factual validation errors clearly.
- Save successful generated resumes as versions.
- Provide a summary of what changed.
- Allow the user to switch to Review Mode when needed.

Quick Generate does not mean skipping factual validation.

## 10.2 Review Mode

**Requirement ID: FR-006**

Optimized for transparency and user control.

### Workflow

1. User submits the Job Description.
2. The system analyzes job requirements.
3. AI proposes tailored changes.
4. The system displays original and proposed content.
5. User accepts, rejects, or edits individual proposals.
6. The system creates the tailored resume from accepted content.
7. User previews and exports the PDF.

### Requirements

- Original and proposed text displayed side by side or in a clear diff.
- Accept/reject controls for individual changes.
- Ability to edit proposed text.
- Summary of missing job requirements.
- Ability to accept all eligible changes.
- Ability to restore original content.
- Changes to the tailored resume must not modify the master profile.

# 11. Resume Templates

**Requirement ID: FR-007**

The MVP must provide three templates.

## Template A — Classic Clear

**Reference:** FlowCV Classic Clear.

Design characteristics:

- Single-column layout.
- Clean, classic appearance.
- Clearly separated sections.
- Strong typographic hierarchy.
- Thin section separators.
- Professional spacing.
- Minimal decoration.
- Suitable for corporate and technical roles.

Use the user-provided FlowCV PDF as a visual reference during implementation.

Recreate the intended layout characteristics with original code.

Do not copy proprietary template code or assets.

## Template B — Jake-Inspired

**Reference:** Jake's Resume.

Design characteristics:

- Compact single-column layout.
- High information density.
- Clear experience hierarchy.
- Tight but readable spacing.
- Minimal decorative elements.
- Strong emphasis on technical achievements.
- Appropriate for software engineering applications.

## Template C — Engineering Modern

**Reference:** RenderCV Engineering Resumes style.

Design characteristics:

- Modern, minimalist layout.
- Consistent spacing.
- Subtle visual hierarchy.
- Balanced information density.
- Suitable for senior engineering and architecture roles.

Check applicable licenses before reusing source code or template assets from external projects.

If reuse is restricted or unclear, implement the design independently.

## 11.1 Template Architecture

All templates must accept the same normalized resume data schema.

Templates may define:

- Section layout.
- Spacing.
- Dividers.
- Margins.
- Typography sizes.
- Alignment.
- Page-break rules.
- Header arrangement.

Templates must not contain AI tailoring logic or mutate resume data.

# 12. Typography and PDF Design

**Requirement ID: FR-008**

## 12.1 Required Font

**Inter is mandatory for all generated resume PDFs.**

Use licensed, locally bundled Inter font files.

Do not rely on the user's installed fonts or a network request during PDF generation.

Embed the required font subsets in exported PDF files.

## 12.2 Default Typography

| Element             | Font Weight | Size    |
| ------------------- | ----------- | ------- |
| Candidate name      | Bold        | 22 pt   |
| Professional title  | Medium      | 12 pt   |
| Section headings    | SemiBold    | 11.5 pt |
| Body text           | Regular     | 10.5 pt |
| Job titles          | SemiBold    | 10.5 pt |
| Dates               | Regular     | 9.5 pt  |
| Contact information | Regular     | 9.5 pt  |

Templates may use controlled variations while preserving readability.

## 12.3 Page Settings

Default:

- Page format: A4.
- Additional option: US Letter.
- Orientation: Portrait.
- Maximum target length: Two pages for typical experienced-professional resumes.
- One-page rendering supported when content fits naturally.

Never remove essential content solely to force a one-page limit.

## 12.4 Pagination

The rendering engine must:

- Prevent overlapping text.
- Prevent clipped content.
- Avoid splitting headings from their following content.
- Avoid orphaned bullet markers.
- Handle content wrapping consistently.
- Preserve readable margins.
- Support natural multi-page content.
- Avoid unnecessary blank pages.

## 12.5 ATS-Oriented Requirements

PDFs must:

- Contain selectable text.
- Preserve sensible reading order.
- Use recognizable section headings.
- Avoid image-only text.
- Avoid complex visual elements that interfere with extraction.
- Include real textual links where appropriate.
- Avoid hidden keyword stuffing.

Automated text extraction must be part of the PDF validation test suite.

Do not claim universal ATS compatibility or guaranteed ATS scores.

# 13. Resume Preview and Editor

**Requirement ID: FR-009**

Provide a document preview reflecting the final PDF as closely as practical.

### Features

- Template switching.
- Live content editing.
- Resume section reordering.
- Add/remove bullets.
- Show/hide optional sections.
- Page count display.
- A4/Letter selection.
- Zoom controls.
- PDF export.
- Layout warning display.

Template switching must preserve all content and user edits.

The exported PDF is the final rendering authority. Differences between browser preview and exported PDF must be caught through visual regression and pagination tests.

# 14. Resume Version History

**Requirement ID: FR-010**

Every successfully generated resume must be saved as an immutable revision.

Store:

- Resume revision identifier.
- Master profile revision identifier.
- Associated Job Description.
- Company and position where known.
- AI provider and model identifier.
- Template identifier.
- Generation mode.
- Generated structured content.
- Generation timestamp.
- Content change report.
- Validation status.

### User Capabilities

- View previous resumes.
- Duplicate a previous version.
- Restore content into a new editable version.
- Download previously generated output.
- Identify the job description associated with each resume.

Previous versions must not be overwritten by later generations.

# 15. AI Provider System

**Requirement ID: FR-011**

Cverixa must support pluggable AI providers.

## 15.1 Initial Providers

### OpenAI

Use an officially supported server-side SDK or compatible integration.

### Anthropic

Use an officially supported server-side SDK or compatible integration.

### Ollama

Support compatible locally hosted Ollama instances.

The application should allow selecting a model exposed by a configured Ollama endpoint.

## 15.2 Provider Configuration

The settings interface must support:

- Provider selection.
- Model selection.
- Connection verification.
- Provider availability status.
- Secure API credential configuration.
- Default provider and model.
- Timeout configuration.
- Model capability validation.

Use explicit, documented model identifiers rather than assuming a hardcoded default model will remain available indefinitely.

## 15.3 Provider Abstraction

Define an application-level provider contract conceptually similar to:

```typescript
interface AIProvider {
  id: string;

  listModels(): Promise<AIModel[]>;

  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}
```

The actual implementation may refine this interface.

Provider implementations must isolate vendor-specific APIs, structured output mechanisms, timeout behavior, and error handling.

Validate responses independently of provider-specific guarantees.

## 15.4 AI Cost Management

- No resume-builder subscription required.
- Ollama supports a path without paid external AI API usage.
- Cloud APIs are optional and may incur usage charges.
- Show users which provider and model are selected.
- Do not silently switch to a paid provider.
- If the selected provider fails, show an error or request approval before using another provider.
- Do not log API keys, raw credentials, or sensitive request contents.

## 15.5 Ollama Deployment Constraints

A locally running Ollama instance is not automatically accessible from a cloud-deployed web application.

The MVP must support a documented local development setup where the application server can reach Ollama.

For publicly deployed instances, remote Ollama connectivity must be explicitly configured and secured.

Never expose a private Ollama instance directly to the public internet by default.

Reject unsafe or arbitrary internal endpoint configurations in hosted environments.

# 16. Relevance and Gap Analysis

**Requirement ID: FR-012**

Provide a transparent report about how the confirmed professional profile supports the target job description.

For each extracted requirement, show:

- Requirement description.
- Mandatory or preferred classification.
- Evidence status.
- Supporting career evidence, when available.
- Missing evidence where applicable.

### Example

| Job Requirement          | Status              | Evidence                            |
| ------------------------ | ------------------- | ----------------------------------- |
| React and TypeScript     | Supported           | Confirmed experience                |
| Frontend architecture    | Supported           | Confirmed architecture achievements |
| Team leadership          | Partially supported | Relevant responsibilities           |
| Java backend development | Not evidenced       | No confirmed experience             |

Do not generate arbitrary ATS percentages or numerical interview probabilities.

A descriptive coverage summary is preferable to a fabricated precision score.

# 17. User Interface and Experience

**Requirement ID: FR-013**

## 17.1 UX Principles

- Modern.
- Minimalist.
- Fast.
- Professional.
- Accessible.
- Clear progress and error states.
- Minimal clicks for repeat workflows.

## 17.2 MVP Screens

1. Owner Login.
2. Dashboard.
3. Resume Import.
4. Master Profile Editor.
5. Job Description Input and Analysis.
6. Generate Resume.
7. Review Changes.
8. Resume Preview and Editor.
9. Resume History.
10. AI Provider Settings.

## 17.3 Dashboard

Show:

- Master Career Profile status.
- Recent generated resumes.
- Recent job descriptions.
- Quick Generate action.
- Import Resume action.
- Active AI provider.

## 17.4 Responsive Design

Support desktop, tablet, and mobile.

Prioritize desktop usability for document editing and PDF preview.

On smaller screens, provide a usable simplified editor and preview rather than forcing desktop-scale controls.

## 17.5 Accessibility

Target WCAG 2.2 AA for core workflows.

Support:

- Keyboard navigation.
- Visible focus states.
- Accessible form labels.
- Meaningful error messages.
- Adequate contrast.
- Screen-reader-friendly controls.

# 18. Technical Architecture

The following architecture is the default implementation baseline for the MVP.

## 18.1 Technology Stack

| Layer                     | Technology                                                  |
| ------------------------- | ----------------------------------------------------------- |
| Web framework             | Next.js App Router                                          |
| Language                  | TypeScript                                                  |
| UI                        | React                                                       |
| Styling                   | Tailwind CSS                                                |
| UI primitives             | Accessible reusable components                              |
| Database                  | PostgreSQL                                                  |
| ORM                       | Prisma                                                      |
| Validation                | Zod                                                         |
| AI integration            | Provider adapter architecture                               |
| Client/server data access | Server-first, with a dedicated query strategy where needed  |
| Authentication            | Owner-only secure credential authentication                 |
| PDF rendering             | HTML/CSS templates with server-side Chromium via Playwright |
| DOCX parsing              | Maintained server-side DOCX extraction library              |
| PDF text extraction       | Maintained PDF parsing library                              |
| Unit/integration testing  | Vitest                                                      |
| End-to-end testing        | Playwright                                                  |
| CI                        | GitHub Actions                                              |

Use current stable compatible package versions at implementation time, with committed lockfiles.

## 18.2 Repository Architecture

Use a single repository and modular monolith architecture.

Do not introduce microservices or micro-frontends for the MVP.

Suggested structure:

```text
cverixa/
├── app/
├── src/
│   ├── components/
│   ├── features/
│   │   ├── authentication/
│   │   ├── career-profile/
│   │   ├── resume-import/
│   │   ├── job-analysis/
│   │   ├── resume-tailoring/
│   │   ├── resume-rendering/
│   │   ├── resume-history/
│   │   └── ai-settings/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   ├── prompts/
│   │   │   └── schemas/
│   │   ├── database/
│   │   ├── document-processing/
│   │   └── security/
│   ├── templates/
│   │   ├── classic-clear/
│   │   ├── jake-inspired/
│   │   └── engineering-modern/
│   ├── lib/
│   └── types/
├── prisma/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── pdf/
├── docs/
├── .github/
│   └── workflows/
├── .env.example
└── README.md
```

The existing repository must be inspected before applying this structure.

Do not overwrite existing work without understanding it.

## 18.3 Dependency Boundaries

Enforce separation between:

- AI providers.
- Resume business logic.
- Persistence.
- Template rendering.
- Document import.
- User interface.

AI provider implementations must not directly modify database entities.

PDF rendering must not call AI models.

Document parsing must not depend on UI components.

# 19. Data Architecture

Use structured and validated data contracts.

## 19.1 Primary Entities

### User

- id
- email
- passwordHash
- createdAt
- updatedAt

MVP owner authentication may be provisioned through secure setup rather than public registration.

### CareerProfile

- id
- ownerId
- name
- currentRevisionId
- createdAt
- updatedAt

### CareerProfileRevision

- id
- profileId
- version
- structuredData
- confirmedAt
- createdAt

### JobDescription

- id
- ownerId
- title
- company
- location
- sourceUrl
- originalText
- structuredRequirements
- createdAt

### Resume

- id
- ownerId
- careerProfileId
- jobDescriptionId
- title
- createdAt
- updatedAt

### ResumeRevision

- id
- resumeId
- version
- templateId
- content
- changeReport
- generationMetadata
- validationStatus
- createdAt

### GenerationRun

- id
- ownerId
- careerProfileRevisionId
- jobDescriptionId
- providerId
- modelId
- status
- failureReason
- startedAt
- finishedAt

### AIProviderConfiguration

- id
- ownerId
- providerId
- modelId
- configuration
- createdAt
- updatedAt

Keep provider secrets out of ordinary JSON configuration records.

## 19.2 Data Rules

- All IDs must be stable.
- Structured content must be schema-versioned.
- Resumes must reference the source profile revision.
- Generated resume revisions must be immutable.
- Database migrations must be repeatable.
- Optional fields must be handled explicitly.
- Do not use free-form AI output as the database schema.

## 19.3 Evidence Tracking

Generated or modified claims must support references to confirmed source facts.

This should include identifiers for relevant work experiences, achievements, projects, or skills.

Evidence-based validation is a mandatory part of the generation workflow.

# 20. Authentication and Security

**Requirement ID: NFR-001**

The MVP is single-user but may be internet-accessible.

It must therefore support owner authentication.

### Requirements

- Secure password hashing.
- Server-side authentication checks.
- Protected application routes.
- Secure, HttpOnly session cookies.
- HTTPS in production.
- SameSite cookie protection.
- Login rate limiting.
- No public account registration.
- No default credentials.
- No hardcoded secrets.

### API Keys

- API keys must never be shipped to the browser.
- Prefer server-side environment configuration for MVP credentials.
- Display only masked or non-sensitive provider configuration information.
- Never include credentials in logs, exported resumes, or error reports.
- Do not commit real API keys to GitHub.

### Document Security

- Validate file content, not only extensions.
- Apply size limits.
- Treat uploaded documents and job descriptions as untrusted inputs.
- Do not execute embedded document content.
- Keep imported resume content isolated from AI system instructions.
- Protect against prompt injection in job descriptions.
- Avoid storing original documents beyond what is necessary.
- Provide user-accessible deletion capabilities.
- Do not expose private profile or document data through public URLs.

### Data Privacy

Cloud AI providers receive user-approved content as necessary for the selected operation.

The UI must make external AI processing clear.

Ollama should allow local inference when the configured infrastructure supports it.

No user content may be used for undisclosed application analytics or training pipelines.

# 21. PDF Rendering Architecture

**Requirement ID: NFR-002**

Use one authoritative server-side rendering pipeline.

### Default Implementation

1. Load a validated ResumeRevision.
2. Apply the selected template.
3. Generate print-oriented HTML.
4. Load bundled Inter fonts.
5. Render using server-side Chromium.
6. Export PDF.
7. Validate PDF structure and text extraction.
8. Return the document securely.

### Requirements

- No AI involvement in final layout.
- Fixed, testable font configuration.
- Consistent print styles.
- A4 and US Letter support.
- Reliable multi-page rendering.
- No unnecessary rasterization.
- No invisible text.
- No clipping or overlapping.
- Deterministic results for the same data and rendering environment.

### Preview

Use the same templates and layout rules where feasible.

If the browser preview cannot reproduce exact pagination, clearly use the server-generated PDF preview as the final authority.

### Testing

Build a fixture collection containing:

- Short resumes.
- Long resumes.
- Multiple projects.
- Many skills.
- Long company names.
- Long URLs.
- Multi-line bullet points.
- Empty optional sections.
- One-page and multi-page cases.

Validate extracted text and visual output.

# 22. Error Handling and Reliability

**Requirement ID: NFR-003**

The application must handle failures without silently losing user data.

### AI Failures

Handle:

- Invalid credentials.
- Rate limits.
- Provider downtime.
- Context size limits.
- Malformed structured responses.
- Model incompatibility.
- Timeouts.
- Incomplete generations.

### Recovery

- Preserve user input.
- Show actionable errors.
- Allow safe retry.
- Avoid duplicate revisions on retry.
- Do not automatically switch to paid providers.
- Preserve completed draft state.
- Record safe, non-sensitive diagnostic metadata.

### Background Work

For potentially long operations, provide visible progress states and clear cancellation or retry semantics.

A simple database-backed generation status model is acceptable for MVP.

Do not add complex distributed infrastructure without demonstrated need.

# 23. Performance Requirements

**Requirement ID: NFR-004**

Performance targets should be evaluated under documented conditions.

### Targets

- Responsive UI during AI generation.
- No blocking of the main UI thread by PDF export.
- Cached profile and resume retrieval where appropriate.
- Debounced preview updates.
- Efficient regeneration when only template configuration changes.
- Avoid redundant AI calls when changing templates.
- Reuse structured Job Description analysis where still valid.

AI generation latency depends on provider, model, hardware, and input size.

Do not guarantee a universal generation time.

# 24. Observability

**Requirement ID: NFR-005**

Provide basic operational diagnostics without exposing private resume content.

Log:

- Request identifiers.
- Generation status.
- Provider name.
- Model identifier.
- Processing duration.
- Error category.
- Rendering failures.
- Import failures.

Do not log:

- Full resume contents.
- Raw job descriptions by default.
- Passwords.
- API credentials.
- Authentication tokens.

# 25. Testing Strategy

## 25.1 Unit Tests

Cover:

- Resume schema validation.
- Requirement matching.
- Source evidence validation.
- Claim validation.
- Resume revision logic.
- Template selection.
- Provider abstraction.
- Error normalization.

## 25.2 Integration Tests

Cover:

- PDF import.
- DOCX import.
- Provider adapter behavior using mocks.
- Generation persistence.
- PDF export.
- Authentication boundaries.

## 25.3 End-to-End Tests

Critical scenarios:

1. Log in.
2. Import a resume.
3. Correct extracted information.
4. Confirm Master Career Profile.
5. Paste a Job Description.
6. Generate a tailored resume.
7. Review changes.
8. Switch templates.
9. Download PDF.
10. Open resume history.
11. Restore a previous version.

## 25.4 AI Validation Tests

Build fixtures with known professional histories and target job descriptions.

Verify:

- No invented employers.
- No invented skills.
- No invented achievements.
- No altered employment dates.
- No fabricated numerical metrics.
- Evidence references are correct.
- Missing qualifications are reported.

Tests must include intentionally misleading job descriptions and prompt-injection attempts.

## 25.5 PDF Tests

Automate:

- Text extraction checks.
- Font embedding checks.
- Page count checks.
- Layout snapshot comparisons.
- Visual regression tests.
- Long-content pagination tests.

Do not treat successful PDF creation alone as proof of quality.

# 26. GitHub Repository and Development Workflow

**Requirement ID: DEV-001**

The official project repository is:

https://github.com/Majid-Kia/Cverixa

This repository is the source of truth for the application code and technical documentation.

## 26.1 Initial Repository Setup

Claude Code must:

1. Inspect the repository and existing files.
2. Identify the current default branch.
3. Check for existing project conventions.
4. Initialize the application only where needed.
5. Add project documentation.
6. Establish code quality tooling.
7. Add a proper `.gitignore`.
8. Create `.env.example`.
9. Set up GitHub Actions.
10. Maintain a working local setup.

Never overwrite existing repository content without inspecting it.

## 26.2 Branch Strategy

Use short-lived feature branches.

Examples:

```text
feature/project-foundation
feature/resume-import
feature/master-profile
feature/ai-providers
feature/job-analysis
feature/resume-tailoring
feature/resume-templates
feature/pdf-rendering
feature/resume-history
```

Use descriptive commits.

Avoid committing broken intermediate states as completed features.

## 26.3 Push and Pull Request Policy

Claude Code must use the configured Git remote associated with:

`https://github.com/Majid-Kia/Cverixa`

Once GitHub authentication and write permissions are available:

- Commit completed changes.
- Push feature branches to GitHub.
- Create Pull Requests where repository tooling and permissions allow.
- Include a clear summary and test results.

Do not push directly to the default branch unless the repository owner explicitly authorizes it.

Do not bypass required checks or branch protection.

If GitHub authentication is unavailable, preserve local commits and clearly report the required manual setup.

## 26.4 Continuous Integration

Configure GitHub Actions to run:

- Dependency installation.
- TypeScript validation.
- Linting.
- Unit tests.
- Integration tests where suitable.
- Production build.
- PDF fixture checks where the runner supports them.

Do not include real secrets in workflows.

## 26.5 Documentation

Maintain:

- README.md
- docs/architecture.md
- docs/data-model.md
- docs/ai-providers.md
- docs/resume-rendering.md
- docs/deployment.md
- docs/decisions/
- .env.example

Major architecture decisions should be documented in lightweight ADRs.

# 27. Deployment

**Requirement ID: DEV-002**

Cverixa must be deployable as a web application.

## 27.1 Local Development

Provide a reproducible local setup, preferably using Docker Compose for infrastructure dependencies.

Required services:

- Next.js application.
- PostgreSQL database.
- Optional Ollama service or connection to an existing Ollama instance.

## 27.2 Production

Use a Node.js-compatible hosting environment with support for server-side Chromium.

Requirements:

- Secure HTTPS.
- PostgreSQL connection.
- Secure environment variables.
- Persistent data storage.
- Database migrations.
- Authenticated application access.
- Logging and error handling.
- Automated production build.

Do not assume that every serverless platform supports Chromium PDF rendering without configuration.

A container-based deployment path is preferred for predictable PDF generation.

## 27.3 Deployment Documentation

Document:

- Required environment variables.
- Database setup.
- Secret setup.
- Build process.
- Startup process.
- PDF dependencies.
- Ollama connectivity restrictions.
- Backup and restore considerations.

Do not require paid hosting for local development.

Production infrastructure costs, if any, are separate from the application's software requirements.

# 28. Implementation Phases

Implement in the following order.

## Phase 1 — Project Foundation

Deliverables:

- Repository initialized.
- Next.js application.
- TypeScript configuration.
- Tailwind styling.
- Database setup.
- Authentication.
- Shared UI primitives.
- Basic dashboard.
- CI.
- Environment configuration.

**Completion gate:** Application starts locally, protected routes work, and CI passes.

## Phase 2 — Master Career Profile

Deliverables:

- Structured resume schema.
- Profile editor.
- PDF import.
- DOCX import.
- Import validation.
- User confirmation flow.
- Profile persistence.

**Completion gate:** A user can import or manually create a complete reusable profile.

## Phase 3 — AI Infrastructure

Deliverables:

- Provider interfaces.
- OpenAI adapter.
- Anthropic adapter.
- Ollama adapter.
- Provider settings.
- Structured output validation.
- Error handling.
- Mock provider for automated tests.

**Completion gate:** The same structured task can run through supported configured providers without changing application business logic.

## Phase 4 — Job Analysis and Tailoring

Deliverables:

- Job description input.
- Requirement extraction.
- Evidence matching.
- Resume tailoring.
- Claim validation.
- Quick Generate.
- Review Mode.
- Change reporting.

**Completion gate:** A resume can be tailored from confirmed career facts with auditable changes and no unsupported claims in acceptance tests.

## Phase 5 — Resume Templates and PDF

Deliverables:

- Classic Clear.
- Jake-Inspired.
- Engineering Modern.
- Inter typography.
- A4/Letter support.
- Live preview.
- PDF generation.
- PDF extraction tests.
- Pagination and visual regression tests.

**Completion gate:** All templates render consistent, readable, selectable-text PDFs.

## Phase 6 — History and Quality Improvements

Deliverables:

- Resume version history.
- Generation metadata.
- Job description associations.
- Restore/duplicate functionality.
- End-to-end workflows.
- Accessibility testing.
- Deployment documentation.

**Completion gate:** Complete user workflow passes locally and in a production-like environment.

# 29. Definition of Done

A feature is complete only when:

- Functional requirements are implemented.
- Relevant acceptance criteria pass.
- TypeScript checks pass.
- Lint checks pass.
- Automated tests pass.
- Errors are handled.
- Security implications are reviewed.
- UI is responsive.
- Documentation is updated.
- No secrets are committed.
- Changes are committed to the correct branch.
- A Pull Request is ready, or the absence of GitHub access is explicitly reported.

For PDF-related features:

- PDF text extraction works.
- Inter is embedded.
- Layout tests pass.
- No clipping or overlap occurs in approved fixtures.

For AI-related features:

- Responses are schema-validated.
- Unsupported claims are rejected.
- Provider failures are handled.
- Source evidence is preserved.

# 30. MVP Acceptance Scenarios

## Scenario A — Import an Existing Resume

**Given:** The user uploads a valid PDF resume.

**When:** The system processes the document.

**Then:** An editable career profile is created for review.

**And:** The user can correct and confirm the information.

## Scenario B — Generate a Job-Specific Resume

**Given:** A confirmed Master Career Profile exists.

**And:** A Job Description has been provided.

**When:** The user selects Quick Generate.

**Then:** The system analyzes requirements and generates a tailored resume.

**And:** No unsupported professional facts are introduced.

**And:** The resume is available for preview and PDF export.

## Scenario C — Review AI Changes

**Given:** AI proposes changes to existing content.

**When:** Review Mode is enabled.

**Then:** The user can accept, reject, or edit individual proposals.

**And:** The Master Career Profile remains unchanged.

## Scenario D — Change Templates

**Given:** A tailored resume exists.

**When:** The user changes the template.

**Then:** The content remains unchanged.

**And:** The preview updates.

**And:** No new AI call is necessary.

## Scenario E — Select a Local AI Provider

**Given:** A reachable Ollama instance is configured.

**When:** The user selects an available compatible local model.

**Then:** Generation uses the configured Ollama connection.

**And:** No paid cloud provider is invoked without user authorization.

## Scenario F — Detect Fabricated Content

**Given:** A Job Description requires an unverified skill.

**When:** AI attempts to include that skill as an existing qualification.

**Then:** The system rejects the unsupported claim.

**And:** The missing qualification is reported.

## Scenario G — Generate a Professional PDF

**Given:** A valid structured resume exists.

**When:** The user exports it as PDF.

**Then:** The PDF uses embedded Inter fonts.

**And:** Text is selectable and extractable.

**And:** Content is not clipped or overlapped.

## Scenario H — Preserve History

**Given:** Multiple resumes have been generated for different jobs.

**When:** The user opens Resume History.

**Then:** Each resume can be associated with its Job Description and profile version.

**And:** Earlier saved versions remain accessible.

# 31. AI Coding Agent Instructions

This section provides explicit implementation guidance to Claude Code.

## 31.1 Project Goal

Build a production-minded MVP of Cverixa according to this PRD.

Prioritize functional correctness, maintainability, predictable PDF rendering, and accurate AI behavior.

## 31.2 Decision-Making Rules

When implementation details are not specified:

1. Follow the documented product objectives.
2. Prefer established, maintainable solutions.
3. Avoid unnecessary architectural complexity.
4. Keep AI providers replaceable.
5. Keep content independent of templates.
6. Prioritize security and data integrity.
7. Document significant technical decisions.
8. Ask for clarification only when a choice materially changes product behavior, cost, security, or an established requirement.

Do not silently introduce paid services.

Do not introduce unrelated features.

Do not replace user-selected technologies without a documented compatibility or security reason.

## 31.3 Development Rules

- Use TypeScript consistently.
- Prefer small, cohesive modules.
- Keep domain logic separate from UI.
- Validate input at trust boundaries.
- Handle expected errors explicitly.
- Maintain readable, testable code.
- Avoid speculative abstraction.
- Avoid premature optimization.
- Prefer existing project conventions when compatible with the PRD.

## 31.4 Workflow

For each implementation phase:

1. Inspect existing code.
2. Review dependencies and interfaces.
3. Write a short implementation plan.
4. Implement the scoped functionality.
5. Add or update tests.
6. Run relevant quality checks.
7. Resolve failures.
8. Update documentation.
9. Commit changes.
10. Push to the feature branch when authorized and configured.
11. Prepare a Pull Request.
12. Report completed work and any remaining limitations.

Do not report a phase as completed when its completion gate has not passed.

## 31.5 Explicit Restrictions

Do not:

- Invent candidate experience.
- Depend on paid resume-building platforms.
- Hardcode API keys.
- Commit `.env` secrets.
- Disable authentication for public deployment.
- Bypass GitHub branch protections.
- Generate final resumes as rasterized images.
- Let AI determine arbitrary PDF layout.
- Modify the Master Career Profile during tailoring.
- Replace structured data with uncontrolled plain text.
- Claim ATS certification or guaranteed interview outcomes.

# 32. Final Product Vision

Cverixa should evolve from a simple resume builder into a reliable AI career-document platform.

Its long-term competitive advantage should come from:

1. High-quality, consistent resume rendering.
2. Accurate job-specific tailoring.
3. A reusable, evidence-based professional profile.
4. Transparent AI-generated changes.
5. Flexible AI provider selection.
6. Independent operation without resume-builder subscriptions.
7. A fast, reliable workflow for repeated job applications.

**The MVP is successful when a user can import their professional history once, provide a new job description, generate a truthful and relevant resume with minimal intervention, and download a clean, professional PDF that looks excellent across all three templates.**

---

**End of PRD — Cverixa v1.0**
