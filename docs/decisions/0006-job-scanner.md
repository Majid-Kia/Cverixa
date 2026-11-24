# ADR 0006: Job Scanner sources, matching and scheduling

Date: 2026-11-24 · Status: accepted

## Context

The Job Scanner has to find jobs abroad, say truthfully what each posting states about visa sponsorship, score jobs against the confirmed profile, and run daily without a browser. The deployment target includes hosts that sleep when idle (Render's free tier). Many well-known job sites offer no permitted way to read their listings.

## Decision

- **Sources are adapters over published APIs only.** Arbeitnow, Greenhouse, Ashby, Remotive and Lever publish unauthenticated endpoints for this purpose. LinkedIn, Indeed, EURES and Welcome to the Jungle do not; they are search links and manual import, labelled as not scanned. No scraping, no login, no evasion of anti-bot measures.
- **Sponsorship is classified by rules, with the AI as a second reader.** The status comes from sentences in the posting. An AI statement counts only with a verbatim quote, judged as the whole sentence it comes from, and can never override an explicit exclusion or confirm from hedged or limited wording.
- **The match score is computed without AI.** The AI extracts requirements once per posting; the existing deterministic evidence matcher compares them with confirmed profile facts. The profile is not sent to a provider during scans, an undocumented qualification cannot be credited, and rescoring after a profile or rubric change is free.
- **Schedule state lives in the database.** A due slot is claimed with a conditional update of `nextRunAt`, which makes runs idempotent across triggers and instances. Triggers are a bearer-protected cron endpoint and an optional in-process check. A unique lock column allows one scan per owner.

## Alternatives considered

- Scraping LinkedIn or Indeed search pages: prohibited by their terms and requires evading protections.
- A paid job aggregation API: not approved, and unnecessary for a first version.
- Asking the AI to score each job against the profile: sends the profile with every listing, costs a second request per listing, cannot be recomputed for free and can credit qualifications that are not documented.
- A job queue (BullMQ, pg-boss) or a separate worker service: more infrastructure than one daily job per owner needs, and it would not solve a sleeping host any better than an external cron call does.
- An in-process timer as the only schedule: lost on restart and silent on a sleeping host.

## Consequences

- Coverage of Greenhouse, Ashby and Lever is limited to the company boards the owner lists.
- The sponsorship rules are conservative: an offer in unfamiliar wording shows as possible or unknown, not confirmed.
- Hosts that sleep need the external cron call; the repository ships a GitHub Actions workflow for it.
- Multi-user mode needs no change to the model: every table is scoped by owner, and the scheduler already iterates over owners.
