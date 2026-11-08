# Deployment

Cverixa runs anywhere Node.js 22+ and Chromium are available. A container is the recommended path because PDF rendering needs Chromium and its system libraries; serverless platforms generally do not provide them without extra configuration.

## Environment variables

| Variable                                      | Required            | Description                                                      |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                                | yes                 | PostgreSQL connection string                                     |
| `SESSION_SECRET`                              | yes                 | 32+ random characters; rotating it signs everyone out            |
| `APP_URL`                                     | yes                 | Public URL (https in production)                                 |
| `NODE_ENV`                                    | yes                 | `production` enables Secure cookies and Ollama host restrictions |
| `OPENAI_API_KEY`                              | optional            | Enables OpenAI                                                   |
| `ANTHROPIC_API_KEY`                           | optional            | Enables Anthropic                                                |
| `OLLAMA_BASE_URL`                             | optional            | Ollama endpoint reachable from the server                        |
| `OLLAMA_ALLOWED_HOSTS`                        | production          | Allow-list for Ollama hosts (`host:port,...`)                    |
| `AI_TIMEOUT_MS`                               | optional            | Default 120000                                                   |
| `IMPORT_MAX_FILE_SIZE_MB`, `IMPORT_MAX_PAGES` | optional            | Upload limits (defaults 10 / 10)                                 |
| `CHROMIUM_EXECUTABLE_PATH`                    | optional            | Use a system Chromium instead of the Playwright-managed one      |
| `AI_ENABLE_MOCK_PROVIDER`                     | never in production | Deterministic test provider                                      |
| `OWNER_EMAIL`, `OWNER_PASSWORD`               | bootstrap only      | Read by `pnpm owner:create`                                      |

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
- Keep `AI_ENABLE_MOCK_PROVIDER` unset.
- Restrict Ollama with `OLLAMA_ALLOWED_HOSTS`; never publish an Ollama port on the internet.
- Give the container enough memory for Chromium (512 MB minimum; 1 GB recommended for long resumes).
- Point `/api/health` at your uptime/readiness probe (checks the database connection).
- Logs are JSON lines on stdout; they contain no resume content or secrets.

## Backup and restore

All user data lives in PostgreSQL (profiles, revisions, job descriptions, resumes, generation runs, provider preferences). Uploaded files are not stored. Back up with `pg_dump`:

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

Free-tier notes: the web service sleeps after inactivity (first request takes ~30 s), it has 512 MB RAM (enough for typical resumes), and Render's free PostgreSQL is deleted 30 days after creation unless upgraded. For a longer-lived free database, point `DATABASE_URL` at a Neon free-tier instance instead. Ollama is not reachable from Render, so configure OpenAI or Anthropic.
