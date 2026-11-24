# Job Scanner

The Job Scanner finds job postings for the owner's target countries and job titles, records what each posting says about visa sponsorship and relocation, scores each posting against the confirmed Master Career Profile, and hands a posting to the existing resume tailoring workflow. It runs on request ("Scan Jobs Now") and on a daily schedule on the server.

Code: `src/features/job-scanner/`. Pages: `/scanner`, `/scanner/[id]`, `/scanner/history`, `/scanner/import`, `/settings/job-search`.

## Sources

Every source is an adapter in `src/features/job-scanner/sources/` behind one interface (`sources/types.ts`). The scan pipeline, settings and history work from the registry (`sources/registry.ts`) and know nothing about a particular source. Adding a source means adding an adapter and registering it.

### Scanned automatically

| Source            | Access                                          | Notes                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arbeitnow         | Free public job-board API, no key               | Strongest for Germany. Has a visa-sponsorship filter, used by default. No keyword search, so the newest pages are read and filtered. Read at most every 30 minutes.                                                             |
| Greenhouse boards | Public Job Board API, one request per company   | No search across companies: you list the company boards to follow. 22 boards are preconfigured as a starting point.                                                                                                             |
| Ashby boards      | Public job posting API, one request per company | Same model as Greenhouse. 16 boards are preconfigured.                                                                                                                                                                          |
| Remotive          | Free public API for remote jobs                 | Used only when Remote is among the work arrangements. Its terms ask for a link back, a credit and a few requests a day at most: one request per scan, at most every 6 hours.                                                    |
| Lever boards      | Public Postings API, one request per company    | **Not verified against the live service.** Built from Lever's published documentation and tested with fixtures; the endpoint could not be reached from the machine it was written on. Off by default with no boards configured. |

Arbeitnow, Greenhouse, Ashby and Remotive were confirmed against the live services on 2026-11-24. One scan with the default settings read 6,359 postings with 41 requests in about 16 seconds.

The preconfigured company boards are companies whose boards existed on that date. They are not a statement that those companies sponsor visas. Edit the lists in Settings > Job Search Preferences; a board that no longer exists is reported as a warning for that board and does not fail the source.

### Linked, not scanned

| Site                  | Why it is not scanned                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LinkedIn Jobs         | LinkedIn has no API for discovering jobs. Its job APIs (Job Posting, Apply Connect) let approved partners post jobs, the Job Posting API is closed to new partners, and its terms prohibit automated collection of listings. |
| Indeed                | The public job search API was withdrawn; automated collection is not permitted.                                                                                                                                              |
| EURES                 | No public API for third-party applications.                                                                                                                                                                                  |
| Welcome to the Jungle | No published API for reading listings.                                                                                                                                                                                       |

For these sites Cverixa does two things, and says so in the interface ("Linked externally, not scanned"):

1. **Search shortcuts** on the Job Scanner page open the site's own search for one of your titles and countries in your browser. Nothing is fetched by the server.
2. **Import a posting** (`/scanner/import`): paste the link and the text of a posting you found. The link is stored but never opened by the server. The posting is then classified, scored, tracked and tailored like a scanned listing, and is marked "Imported by you". A LinkedIn link keeps its LinkedIn job id, so importing it twice does not duplicate it.

Glassdoor and Wellfound have no public API either; postings from them can be imported the same way.

LinkedIn scanning is therefore **not** implemented, because no working, permitted integration exists.

### Rules every adapter follows

- Requests go through `sources/http.ts`, which only contacts the adapter's own hosts over https, does not follow redirects, times out, retries 429 and 5xx responses with backoff (honouring `Retry-After`), caps the response size and enforces a request budget per scan. A value from settings or from a source response cannot send the server to another host.
- Company identifiers are restricted to a conservative character set before they are put in a URL.
- Nothing about the candidate is sent to a source. Sources receive only their documented, fixed requests.
- Each source is isolated: a failure is recorded as that source's outcome and the scan continues.

## What a scan does

`startScan` then `executeScan` in `scan-service.ts`:

1. **Lock.** A scan takes a unique-column lock for the owner, so two scans cannot overlap whatever started them. A scan that stopped reporting for 15 minutes (the server stopped) is marked failed and its lock released.
2. **Fetch** from each enabled source, three at a time.
3. **Filter** each posting (`pipeline.ts`), cheapest checks first: title against your job titles, country, work arrangement, then the visa filters. Every posting that is left out is counted by reason, and the counts are shown in the scan history.
4. **De-duplicate** across sources before anything is saved or analysed.
5. **Save.** A known job is updated in place; only a job seen for the first time creates a listing.
6. **Analyse** new and changed listings with the AI provider, within the limits below.
7. **Score** every listing whose score is out of date (no AI involved).

Outcomes: `completed`; `partial` when a source failed, a listing could not be saved or AI analysis had a problem; `failed` only when every source that ran failed. Results saved before a failure are kept.

### Title matching

A listing is kept when its title contains every word of one of your lines, in any order. "front-end", "front end" and "frontend" are the same word, as are "developer" and "engineer". A line that starts with a minus sign excludes titles: `-React Native` drops mobile roles that `React Engineer` would otherwise match.

### Country filtering

`countries.ts` maps a source's location text to ISO country codes: country names and aliases first, then a gazetteer of well-known cities, with a US state or Canadian province used to tell cities of the same name apart. A listing is kept when its location names a selected country. A remote listing is also kept when the region it is open to (for example "Europe") covers a selected country. A location that cannot be mapped is left out and counted as "Location could not be mapped to a country"; it is never guessed. With no country selected, every location is accepted.

### Duplicates

A job is recognised as already known by, in order: the source's own id, the posting URL (tracking parameters removed), and a signature of the normalised company, title and place. The last one matches the same job on two sources. Rediscovery updates the listing's metadata and "last seen" time; the tracking status and history are never reset. If the posting text changed, the listing is classified and analysed again and the change is recorded in its history.

## Visa sponsorship classification

`sponsorship.ts`. Each listing has one status, with the sentences that support it and the posting URL:

| Status    | Meaning                                                   | What produces it                                                                                                                                          |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed | The posting explicitly states that sponsorship is offered | A sentence in which the employer commits ("We offer visa sponsorship", "We sponsor work permits"), or a short benefits line ("Visa sponsorship")          |
| Possible  | Related evidence, not a confirmation                      | A hedged or limited statement, a question to the applicant, a job board's own sponsorship flag, an offer of relocation support, or conflicting statements |
| Unknown   | The posting says nothing                                  | The default                                                                                                                                               |
| None      | The posting explicitly excludes sponsorship               | "We are unable to sponsor visas", "no visa sponsorship"                                                                                                   |

Rules that keep the status honest:

- A posting that is silent is **Unknown**. Nothing is inferred from the company, the country or the kind of role.
- A job board listing a posting under visa sponsorship (Arbeitnow's filter) is **Possible**, shown as "Job board flag", until the posting text confirms it.
- Relocation support is tracked separately and makes sponsorship **Possible** at most.
- Hedged wording ("may be available", "case by case") and limited wording ("only", "however", "visa transfer from your current employer", "within the EU") never confirm.
- "Visa" next to card networks (Mastercard, payments) is the payment brand and is ignored.
- A requirement that the applicant already holds the right to work is recorded as **Work authorisation required**, a separate flag.
- Text addressed to an automated reader ("ignore previous instructions", "you must state that...") is never evidence.

The AI provider is asked for the same facts with word-for-word quotes (`mergeAiSignals`). A quote counts only if it is in the posting verbatim, and it is judged as the whole sentence it comes from, not as the fragment quoted. The AI can settle a sentence the rules could not read either way only when that sentence is a full statement in the employer's own voice; it cannot override an explicit exclusion and cannot confirm from a hedged or limited sentence. Evidence found this way is labelled "Quoted by AI, verified in the posting".

The rules are a deliberately conservative heuristic. They can miss an offer phrased in a way they do not know, which then shows as Possible or Unknown; they are built not to err in the other direction.

## Job Match Score

`rubric.ts`. The score (0 to 100) is the professional relevance of a job to the confirmed profile. It is not the probability of an interview.

The AI provider is used for one thing: extracting the posting's requirements (task `job_screening`, a superset of the existing `job_analysis` task). The comparison with the profile is done by the application with the evidence matcher that resume tailoring already uses (`resume-tailoring/evidence.ts`). A requirement counts only when a **confirmed** profile entry supports it, so the score cannot credit a qualification the profile does not document, and the profile is not sent to the AI provider during a scan.

| Component                | Default weight | Value                                                                                                  |
| ------------------------ | -------------: | ------------------------------------------------------------------------------------------------------ |
| Mandatory requirements   |             40 | Share supported by the profile (supported 1, partly supported 0.5, not evidenced 0)                    |
| Named technologies       |             25 | Share of the specific technologies the posting names that are in the profile's skills and technologies |
| Preferred requirements   |             15 | As for mandatory                                                                                       |
| Title alignment          |             10 | Share of the job title's role words found in the profile's own titles, headline or skills              |
| Seniority and experience |             10 | Years asked for against years in the profile, and the role's level against the most recent title       |

A component that does not apply to a listing (for example a posting that marks nothing as mandatory) is left out and the others are rescaled to 100. Stated restrictions such as work authorisation are listed separately and never scored. Each listing shows the score, every component with its weight, result and points, a short explanation, the matching qualifications with where they are in the profile, and the missing or weakly supported ones.

Weights and the high-relevance threshold (default 70) are edited in Settings > Job Search Preferences. Changing them, or changing the profile, rescores existing listings from the stored requirements without any AI request.

## Cost and rate controls

| Control                           | Value                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI requests per listing           | One, cached against a hash of the description. An unchanged posting is never analysed twice.                                                                                                        |
| Listings analysed per scan        | Configurable, default 25, ceiling 100. Confirmed sponsorship first, then possible, then the rest. Listings beyond the limit wait for the next scan or the "Analyse this job" button.                |
| AI concurrency                    | 2                                                                                                                                                                                                   |
| Retries                           | One retry for transient AI errors; analysis stops for the scan after three failures in a row or an authentication error                                                                             |
| Attempts per listing              | 3, then left for a manual retry                                                                                                                                                                     |
| Provider                          | The owner's default provider only. The scanner never switches provider. If none is configured, or it fails, listings are still discovered and classified and the scan says why they are not scored. |
| Source concurrency                | 3 sources at a time; boards within a source one after another                                                                                                                                       |
| Requests per source per scan      | Arbeitnow 6, Greenhouse 60, Ashby 60, Lever 60, Remotive 1                                                                                                                                          |
| Company boards per source         | 40                                                                                                                                                                                                  |
| Listings kept per source per scan | 150, newest first                                                                                                                                                                                   |
| Manual scans                      | 6 per hour per owner (in memory, per instance), and never two at once                                                                                                                               |
| Reuse by tailoring                | "Tailor Resume for This Job" stores the already extracted requirements with the job description, so tailoring does not extract them again                                                           |

The preferences page states which provider will be used and whether it may incur charges.

## Scheduled scans

The schedule is a time of day and an IANA time zone (for example 05:00, Europe/Amsterdam), stored with the next run as a UTC instant (`JobSearchPreferences.nextRunAt`). Daylight-saving changes are followed: 05:00 stays 05:00 local time.

All schedule state is in the database. A due run is **claimed** by a conditional update that advances `nextRunAt` (`scheduler.ts`, `claimDueScans`), so each slot runs exactly once however many times, and from however many places, the check is triggered. The slot is also unique per owner in `JobScan`. A scheduled run does not start while another scan is running; that slot is recorded as skipped.

Two things trigger the check, and they can be used together:

1. **Cron endpoint**: `GET` or `POST /api/cron/job-scan` with `Authorization: Bearer $CRON_SECRET`. It starts the due scans and returns at once (`202` with the scan ids, or `200` when nothing was due); the scans run after the response. Add `?wait=1` to hold the response until they finish. Without `CRON_SECRET` the endpoint is disabled. Call it every 10 to 15 minutes; calling it more often is harmless.
2. **In-process check**: on a server that stays running, `src/instrumentation.ts` starts a check that asks the database once a minute whether a scan is due. It holds no schedule state of its own. Turn it off with `JOB_SCAN_INTERNAL_SCHEDULER=false`.

Neither depends on a browser. Which one you need depends on the host:

| Host                                          | Use                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Always-on server (Docker, a VM, `pnpm start`) | The in-process check is enough. The cron endpoint is optional.                                                                                         |
| Host that sleeps when idle (Render free tier) | The cron endpoint, called by an external scheduler, which also wakes the service. `.github/workflows/job-scan-cron.yml` does this from GitHub Actions. |
| Serverless host                               | The cron endpoint with `?wait=1`, within the platform's request time limit.                                                                            |

**Missed runs.** If the server was down at the scheduled time, the run is made up once when the check next fires, provided it is at most 12 hours late. A run missed by more than that is not made up (it would only repeat shortly before the next one); it is recorded in the scan history as skipped and the schedule continues from its next time.

### Setting up the GitHub Actions trigger

1. Set `CRON_SECRET` on the server (24 characters or more), for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. In the repository settings add the secret `CRON_SECRET` with the same value and the variable `APP_URL` with the public URL of the app.
3. The workflow runs every 15 minutes. GitHub may delay scheduled workflows by several minutes, so a scan can start somewhat after its time.

Any scheduler that can send an HTTP request with a header works the same way (Render Cron Jobs, cron-job.org, system cron with `curl`).

## Tracking and history

Listing statuses: New, Saved, Applied, Interviewing, Rejected, Offer, Dismissed. A change is saved at once and added to the listing's history (`JobListingEvent`). Dismissed and Rejected listings are hidden from the default view and kept; a later scan does not bring them back as new.

Scan History lists every run: id, trigger (manual or scheduled), start and finish, status, sources queried, countries and titles searched, postings read, jobs discovered, new jobs, duplicates, postings left out by reason, and per source the requests made, duration, errors and warnings.

## Resume tailoring

"Tailor Resume for This Job" (`prepareTailoring` in `listings-service.ts`) creates a job description from the listing through the existing job-analysis service, once per listing, and opens the existing Generate Resume page with it selected, where Quick Generate or Review Mode runs the existing pipeline. No second tailoring implementation exists. Resumes generated there belong to the listing through its job description and are listed on the listing page.

## Security

- Every page and server action calls `requireUser()`; every query is scoped by `ownerId`. The scan-progress route returns 401 without a session.
- The cron endpoint is the only route without a session. It requires the bearer secret, compared in constant time, and is disabled when no secret is set.
- Posting text is untrusted. It is converted to plain text (scripts and markup removed) and rendered only as text. Links are accepted only as absolute http(s) URLs without credentials, and open with `rel="noopener noreferrer"`.
- In AI prompts the posting sits inside a data block whose tags are neutralised, with the same untrusted-data rules as the rest of the application. Model output is schema-validated, and every quote is checked against the posting.
- No credentials are stored for any source; the automatic sources need none.

## Running it locally

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

1. Sign in, confirm your Master Career Profile and choose a default AI provider (Settings > AI Settings). Without them jobs are still discovered, but not scored.
2. Settings > Job Search Preferences: review countries, job titles and filters, then save.
3. Job Scanner > **Scan Jobs Now**. The scan runs on the server; progress is shown and the page can be closed.
4. For the schedule, tick "Scan automatically every day", choose a time and time zone and save. With `pnpm dev` or `pnpm start` running, the in-process check starts the scan at that time.

To try the cron endpoint locally, set `CRON_SECRET` in `.env`, restart, and run:

```bash
curl -i -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/job-scan
```

## Tests

- `tests/unit/job-scanner-*.test.ts`: location resolution and country filtering, title matching, duplicate signatures, sponsorship classification, AI quote verification and prompt injection, schedule arithmetic across time zones, the rubric, and every source adapter with the request guard.
- `tests/integration/job-scanner.test.ts`: complete scans against a real database with every source answered from fixtures (`tests/fixtures/job-sources.ts`) and the mock AI provider.
- `tests/e2e/job-scanner.spec.ts`: preferences, import, sponsorship display, tracking and the hand-off to Generate Resume in the browser.

No automated test contacts a job source. The browser tests run the server with `JOB_SCAN_ENABLE_DEMO_SOURCE=true`, which adds an offline source of invented postings ("Demo jobs", `sources/demo.ts`), the counterpart of the mock AI provider. It is also useful for trying the feature without network access. Never set it on a real deployment: it would mix invented jobs with real ones.

## Known limitations

- Greenhouse, Ashby and Lever cannot be searched across companies, so coverage is the boards you list.
- The city gazetteer covers well-known cities. A posting that gives only a small town and no country is left out when a country filter is set.
- Two openings with the same title at the same company in the same city are treated as one listing.
- Sponsorship rules are English-first with a few German phrases.
- A listing that disappears from its source is not marked closed; "last seen" shows when it was last found.
- The manual-scan rate limit is in memory and per instance, like the login limiter.
- The in-process schedule check assumes one server instance is enough to trigger it; with several instances the database claim still prevents double runs.
