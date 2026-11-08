# Architecture

Cverixa is a modular monolith built on Next.js (App Router). One deployable unit contains the UI, server actions, API route handlers, the AI provider layer, document processing and the PDF rendering pipeline. PostgreSQL is the only required external service; Ollama is optional.

## Module map

```text
src/app                 Routes, layouts, server components, API route handlers
src/components          UI primitives (button, fields, card) and the app shell
src/features/<name>     One module per product capability:
  authentication        login/logout server actions
  career-profile        profile schema (Zod), normaliser for imports, persistence, editor UI
  resume-import         upload validation -> text extraction -> AI conversion -> review session
  job-analysis          job description CRUD, requirement extraction (AI), keyword helpers
  resume-tailoring      evidence matcher, tailoring orchestration, claim validation,
                        change report, Review Mode proposals
  resume-rendering      fonts, HTML rendering, Chromium PDF, PDF validation, editor UI
  resume-history        resumes and immutable revisions, restore/duplicate
  ai-settings           provider preferences (no secrets), connection checks
src/server/ai           Provider contract + adapters + prompts + AI output schemas
src/server/database     Prisma client (driver adapter for pg)
src/server/document-processing  Magic-byte validation, PDF (unpdf) and DOCX (mammoth) extraction
src/server/security     bcrypt passwords, DB-backed sessions, login rate limiter
src/templates           Three presentation templates sharing one normalized content schema
src/types               ResumeContent schema shared by tailoring, rendering and history
```

## Dependency boundaries (PRD 18.3)

| Rule                                         | How it is enforced                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AI providers never touch the database        | `src/server/ai/*` imports no Prisma code; services call `runStructuredTask` and persist results themselves    |
| PDF rendering never calls AI                 | `src/features/resume-rendering/*` depends only on templates, fonts, Playwright and unpdf                      |
| Document parsing has no UI dependency        | `src/server/document-processing/*` is pure Node code with its own error type                                  |
| Templates never mutate content               | Templates receive a parsed copy and return HTML strings; a unit test asserts content equality after rendering |
| Content is independent of presentation       | `ResumeContent` (src/types/resume-content.ts) is stored per revision; `templateId` is a separate column       |
| Master profile is never changed by tailoring | Tailoring reads `confirmedFactsOnly(profile)` and writes only `Resume`/`ResumeRevision`/`GenerationRun`       |

## Request flows

### Authentication

`src/proxy.ts` redirects requests without a session cookie to `/login`. Every page under `src/app/(app)` and every server action calls `requireUser()`, which resolves the cookie to a `Session` row (token hashed with SHA-256 and the `SESSION_SECRET`). Login is rate limited (10 attempts / 15 minutes per client+email) and passwords are verified with bcrypt.

### Import (FR-001)

1. `uploadResumeAction` receives the file (multipart) and checks size.
2. `importResumeDocument` validates magic bytes and extension agreement, extracts text (PDF via unpdf, DOCX via mammoth) with page/size limits, and rejects encrypted, scanned or empty documents with actionable error codes.
3. The text is sent to the selected provider inside a `<resume_text>` data block with the `profile_import` prompt; the output is validated with `profileImportAiOutputSchema`.
4. `normalizeImportedProfile` assigns stable ids and marks all entries `imported`.
5. An `ImportSession` stores the draft; the owner edits it in the profile editor and confirms, which creates a confirmed `CareerProfileRevision`. The original file is never stored.

### Generation (FR-004/FR-005/FR-006)

```text
getProfileSnapshot -> confirmedFactsOnly
   -> analyzeJobDescription (stage 1, AI, cached on the JobDescription)
   -> matchEvidence (stage 2, deterministic)
   -> runStructuredTask("resume_tailoring") (stage 3-4, AI; output = selections + bullets with sourceIds)
   -> buildTailoredContent: compose ResumeContent from the profile + AI selections
        -> validateClaims (stage 5): evidence refs, immutable employment facts, numbers, sensitive terms
        -> buildChangeReport (stage 6)
   -> quick: createResume + ResumeRevision (immutable), GenerationRun.completed
   -> review: GenerationRun.awaiting_review with { baseline, tailored, proposals }
        -> finalizeReview(decisions) -> applyDecisions -> createResume
```

Stage 7 and 8 (render + validate) run on demand through `/api/resumes/[id]/pdf`.

### Rendering (NFR-002)

`renderResumeHtml` validates content, selects a template and injects `@font-face` rules with base64 Inter. `renderPdf` loads the HTML into a fresh Chromium context with JavaScript disabled and all network requests blocked, emulates print media and exports a tagged PDF with CSS page size. `validateResumePdf` re-opens the PDF, extracts text, checks the candidate name and other expectations, and inspects `/BaseFont` entries so only Inter subsets are referenced.

## Error handling

- `AppError` carries a user-safe message and code; server actions return `{ ok: false, error }` for `useActionState`.
- `AIProviderError` normalises provider failures into categories (`auth`, `rate_limit`, `timeout`, `network`, `context_length`, `model_incompatible`, `invalid_response`, ...). Nothing retries on a different provider automatically.
- `DocumentImportError` codes map to actionable messages for corrupted, unsupported, password-protected, scanned, empty, oversized or too-long documents.
- Generation runs are recorded in `GenerationRun` with status and a non-sensitive failure reason, so retries do not create duplicate revisions and failures remain auditable.

## Observability

`src/lib/logger.ts` emits JSON lines with request-level metadata only: task, provider, model, durations, token counts, error categories, page counts. Keys matching `key|secret|token|password|authorization|cookie` are redacted. Resume content, job description text and prompts are never logged.

## Testing strategy

| Layer       | Location            | Runs                                                                                                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `tests/unit`        | schemas, claim validation (incl. Scenario F and prompt injection), evidence matching, content building, proposals, providers, security, templates |
| Integration | `tests/integration` | document import with generated PDF/DOCX fixtures; database services with embedded PostgreSQL (or `DATABASE_URL_TEST`)                             |
| PDF         | `tests/pdf`         | every template x fixture: text extraction, Inter embedding, overflow and page-count bounds, determinism                                           |
| E2E         | `tests/e2e`         | full owner workflow against a production build with the mock provider                                                                             |
