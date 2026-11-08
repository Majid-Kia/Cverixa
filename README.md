# Cverixa

AI-powered resume builder and job-specific resume tailoring platform.

> Upload your resume once. Tailor it to any job description. Generate a professional, job-specific resume in minutes.

Cverixa keeps one structured **Master Career Profile**, analyses a pasted job description, tailors the profile to it with a pluggable AI provider (OpenAI, Anthropic or a local Ollama model), validates every generated claim against confirmed facts, and renders deterministic PDFs with bundled Inter fonts through server-side Chromium. Nothing is invented: unsupported claims are rejected and reported.

The product requirements live in [docs/requirements.md](docs/requirements.md).

## Status

MVP implementation of all six phases from the PRD:

| Phase | Scope                                                                                                     | State |
| ----- | --------------------------------------------------------------------------------------------------------- | ----- |
| 1     | Next.js app, TypeScript, Tailwind, PostgreSQL/Prisma, owner auth, dashboard, CI                           | Done  |
| 2     | Structured profile schema, profile editor, PDF/DOCX import with review and confirmation                   | Done  |
| 3     | Provider abstraction, OpenAI/Anthropic/Ollama adapters, mock provider, settings UI                        | Done  |
| 4     | Job analysis, evidence matching, tailoring, claim validation, Quick Generate, Review Mode, change reports | Done  |
| 5     | Three templates, Inter typography, A4/Letter, live preview, PDF export with extraction/font checks        | Done  |
| 6     | Immutable version history, restore/duplicate, end-to-end tests, deployment docs                           | Done  |

Known limitations are listed at the end of this file.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Zod 4 · Playwright (Chromium PDF rendering and e2e) · Vitest · GitHub Actions.

## Quick start (local development)

Prerequisites: Node.js 22+ (24 recommended), pnpm 10+, Docker (for PostgreSQL) or any PostgreSQL 14+ instance.

```bash
pnpm install                       # also runs `prisma generate`
pnpm exec playwright install chromium
cp .env.example .env               # then edit: DATABASE_URL, SESSION_SECRET
docker compose up -d postgres      # local PostgreSQL on :5432
pnpm db:migrate                    # apply migrations
OWNER_EMAIL=you@example.com OWNER_PASSWORD='ChangeMe-12345' pnpm owner:create
pnpm dev                           # http://localhost:3000
```

Sign in with the owner account, open **AI Settings**, choose a provider and model, then import a resume or build the profile manually.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### AI providers

Provider API keys are read from the server environment only (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). Ollama needs no key; set `OLLAMA_BASE_URL` (default `http://localhost:11434`). See [docs/ai-providers.md](docs/ai-providers.md). Setting `AI_ENABLE_MOCK_PROVIDER=true` enables a deterministic offline provider for demos and tests.

## Scripts

| Command                                                      | Purpose                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`                     | Development server, production build, production server                                         |
| `pnpm lint`, `pnpm typecheck`, `pnpm format`                 | ESLint, TypeScript, Prettier                                                                    |
| `pnpm test:unit`                                             | Schema, validation, evidence matching, providers, templates, security                           |
| `pnpm test:integration`                                      | PDF/DOCX import and database-backed services (embedded PostgreSQL locally)                      |
| `pnpm test:pdf`                                              | Renders every template against fixtures and checks text extraction, Inter embedding, pagination |
| `pnpm test:e2e`                                              | Playwright flow: login, settings, profile, job, generate, review, templates, history            |
| `pnpm db:migrate` / `pnpm db:migrate:dev` / `pnpm db:studio` | Prisma migrations and data browser                                                              |
| `pnpm owner:create`                                          | Create or reset the single owner account                                                        |

Integration and e2e tests start an embedded PostgreSQL automatically when `DATABASE_URL_TEST` (integration) or `DATABASE_URL` (e2e) is not provided. CI uses a PostgreSQL service container.

## Repository layout

```text
src/app/                 Next.js routes (App Router), API route handlers
src/components/          Shared UI primitives and app shell
src/features/            Feature modules: authentication, career-profile, resume-import,
                         job-analysis, resume-tailoring, resume-rendering, resume-history, ai-settings
src/server/ai/           Provider contract, adapters (openai, anthropic, ollama, mock), prompts, schemas
src/server/database/     Prisma client
src/server/document-processing/  PDF/DOCX validation and text extraction
src/server/security/     Password hashing, sessions, rate limiting
src/templates/           Resume templates (classic-clear, jake-inspired, engineering-modern)
src/types/               Shared resume content schema
prisma/                  Schema and migrations
tests/                   unit, integration, pdf, e2e, fixtures
docs/                    Requirements, architecture, data model, providers, rendering, deployment, ADRs
```

## Documentation

- [docs/architecture.md](docs/architecture.md) – modules, boundaries, request flows
- [docs/data-model.md](docs/data-model.md) – entities, revisions, evidence tracking
- [docs/ai-providers.md](docs/ai-providers.md) – adapters, model ids, Ollama constraints, cost notes
- [docs/resume-rendering.md](docs/resume-rendering.md) – templates, typography, PDF pipeline and validation
- [docs/deployment.md](docs/deployment.md) – environment variables, Docker, migrations, backups
- [docs/decisions/](docs/decisions/) – architecture decision records

## Security notes

Owner-only authentication with bcrypt password hashing, database-backed HttpOnly/SameSite sessions, login rate limiting, no public registration and no default credentials. Uploaded documents are validated by content (magic bytes) and size, parsed as text only, and discarded after extraction. Resume text and job descriptions are passed to models inside data blocks and treated as untrusted; the application validates every AI output against a schema and every generated claim against confirmed profile facts. API keys never reach the browser and are never logged.

## Known limitations

- The browser preview uses the same HTML templates as the PDF but does not paginate; use **Check pagination** or the exported PDF for page breaks.
- Visual regression is covered by layout-overflow checks and text-extraction assertions, not pixel snapshots.
- Rate limiting is in-memory and per instance.
- The evidence matcher is a transparent term-matching heuristic; it reports coverage, never a score.
- Model identifiers change over time; use **Load models** in AI Settings to pick a live id.
