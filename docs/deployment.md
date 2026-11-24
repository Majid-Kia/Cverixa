# Deployment

Cverixa runs anywhere Node.js 22+ and Chromium are available. A container is the recommended path because PDF rendering needs Chromium and its system libraries; serverless platforms generally do not provide them without extra configuration.

## Environment variables

| Variable                                      | Required            | Description                                                                                 |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | yes                 | PostgreSQL connection string                                                                |
| `SESSION_SECRET`                              | yes                 | 32+ random characters; rotating it signs everyone out                                       |
| `APP_URL`                                     | yes                 | Public URL (https in production)                                                            |
| `NODE_ENV`                                    | yes                 | `production` enables Secure cookies and Ollama host restrictions                            |
| `OPENAI_API_KEY`                              | optional            | Enables OpenAI                                                                              |
| `ANTHROPIC_API_KEY`                           | optional            | Enables Anthropic                                                                           |
| `OLLAMA_BASE_URL`                             | optional            | Ollama endpoint reachable from the server                                                   |
| `OLLAMA_ALLOWED_HOSTS`                        | production          | Allow-list for Ollama hosts (`host:port,...`)                                               |
| `AI_TIMEOUT_MS`                               | optional            | Default 120000                                                                              |
| `IMPORT_MAX_FILE_SIZE_MB`, `IMPORT_MAX_PAGES` | optional            | Upload limits (defaults 10 / 10)                                                            |
| `CHROMIUM_EXECUTABLE_PATH`                    | optional            | Use a system Chromium instead of the Playwright-managed one                                 |
| `CRON_SECRET`                                 | for scheduled scans | Bearer token for `/api/cron/job-scan` (24+ characters). The endpoint is disabled without it |
| `JOB_SCAN_INTERNAL_SCHEDULER`                 | optional            | `false` turns off the in-process check for due Job Scanner runs (default on)                |
| `AI_ENABLE_MOCK_PROVIDER`                     | never in production | Deterministic test provider                                                                 |
| `JOB_SCAN_ENABLE_DEMO_SOURCE`                 | never in production | Adds an offline job source with invented postings (demos, tests)                            |
| `OWNER_EMAIL`, `OWNER_PASSWORD`               | bootstrap only      | Read by `pnpm owner:create`                                                                 |

Keep secrets in the platform's secret store or an `.env` file that is never committed (`.env*` is git-ignored; `.env.example` documents every key).

## Database setup

```bash
pnpm db:migrate           # prisma migrate deploy (repeatable, used by CI and the container entrypoint)
```

Migrations live in `prisma/migrations`. Create new ones in development with `pnpm db:migrate:dev --name <change>` against a local database and commit the generated SQL.

## Owner account

There is no registration and no default credential. Provision the single owner once (or reset the password) with:

```bash
OWNER_EMAIL=owner@example.com OWNER_PASSWORD='A-strong-password-123' pnpm owner:create
```

The password must be at least 12 characters with upper-case, lower-case and digits. Running the script again for the same email updates the password and revokes existing sessions.

## Build and start

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium   # PDF dependency
pnpm build                                            # prisma generate + next build
pnpm db:migrate
pnpm start                                            # next start on PORT (default 3000)
```

## Docker

```bash
docker build -t cverixa .
docker run --env-file .env -e DATABASE_URL=postgresql://... -p 3000:3000 cverixa
```

The image is based on the official Playwright image, so Chromium and its libraries are present. The entrypoint applies migrations and starts the server. `docker-compose.yml` provides PostgreSQL (and optionally Ollama) for local use: `docker compose --profile app up --build`.

## Production checklist

- Terminate TLS in front of the app (reverse proxy or platform) and set `APP_URL` to the https origin.
- Set `NODE_ENV=production` so session cookies are `Secure`, `HttpOnly`, `SameSite=Lax`.
- Keep `AI_ENABLE_MOCK_PROVIDER` and `JOB_SCAN_ENABLE_DEMO_SOURCE` unset.
- Restrict Ollama with `OLLAMA_ALLOWED_HOSTS`; never publish an Ollama port on the internet.
- Give the container enough memory for Chromium (512 MB minimum; 1 GB recommended for long resumes).
- Point `/api/health` at your uptime/readiness probe (checks the database connection).
- Logs are JSON lines on stdout; they contain no resume content or secrets.

## Scheduled job scans

The Job Scanner's daily scan runs on the server. Its schedule is stored in the database, so it survives restarts and needs no browser. What triggers it depends on the host (details in [job-scanner.md](job-scanner.md)):

- **Always-on server** (Docker, a VM): nothing to set up. The server checks once a minute whether a scan is due.
- **Host that sleeps when idle** (Render free tier): set `CRON_SECRET` and have an external scheduler call `POST /api/cron/job-scan` with `Authorization: Bearer <CRON_SECRET>` every 10 to 15 minutes. `.github/workflows/job-scan-cron.yml` does this; add the repository secret `CRON_SECRET` and the repository variable `APP_URL`. The call also wakes the service.

A run missed by up to 12 hours is made up once; an older one is skipped and shown in the scan history. The job sources need no credentials. Outbound https access to `www.arbeitnow.com`, `boards-api.greenhouse.io`, `api.ashbyhq.com`, `remotive.com` and, if enabled, `api.lever.co` / `api.eu.lever.co` is required.

## Backup and restore

All user data lives in PostgreSQL (profiles, revisions, job descriptions, resumes, generation runs, provider preferences, job search preferences, discovered listings and scan history). Uploaded files are not stored. Back up with `pg_dump`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=cverixa-$(date +%F).dump
pg_restore --dbname "$DATABASE_URL" --clean --if-exists cverixa-YYYY-MM-DD.dump
```

Provider API keys and `SESSION_SECRET` are environment configuration and must be backed up separately through your secret store.

## Ollama connectivity

See docs/ai-providers.md. In short: the application server, not the user's browser, talks to Ollama. For hosted deployments run Ollama on a private host, allow-list it, and expect generation latency to depend on that machine's hardware.

## Render (free tier)

`render.yaml` describes a free Docker web service plus a free PostgreSQL instance. In the Render dashboard choose **New > Blueprint**, select this repository, then set the secrets marked `sync: false` (`APP_URL`, provider API keys). After the first deploy, create the owner from the service **Shell** tab:

```bash
OWNER_EMAIL=you@example.com OWNER_PASSWORD='A-strong-password-123' pnpm owner:create
```

Scheduled job scans on the free tier need the external trigger described under "Scheduled job scans": the blueprint generates `CRON_SECRET`; copy its value into the repository secret of the same name and set the repository variable `APP_URL`.

Free-tier notes: the web service sleeps after inactivity (first request takes ~30 s), it has 512 MB RAM (enough for typical resumes), and Render's free PostgreSQL is deleted 30 days after creation unless upgraded. For a longer-lived free database, point `DATABASE_URL` at a Neon free-tier instance instead. Ollama is not reachable from Render, so configure OpenAI or Anthropic.
