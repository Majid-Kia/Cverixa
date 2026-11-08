# ADR 0005: Owner-only authentication with database-backed sessions

Date: 2026-11-08 · Status: accepted

## Context

The MVP is single-user but internet-accessible. It must not expose private resumes or AI credentials through an unauthenticated interface, must not ship default credentials, and must not implement public registration.

## Decision

- One owner account, provisioned by `scripts/create-owner.ts` from `OWNER_EMAIL`/`OWNER_PASSWORD` (password strength enforced). Re-running resets the password and revokes sessions.
- Passwords are hashed with bcrypt (cost 12).
- Sessions are rows in `Session` keyed by a SHA-256 hash of a 256-bit random token combined with `SESSION_SECRET`; the raw token lives only in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie with a 14-day expiry. Revocation is immediate by deleting the row.
- `src/proxy.ts` redirects cookie-less requests at the edge; every page and server action re-validates against the database via `requireUser()`.
- Login attempts are rate limited in memory per client/email (10 per 15 minutes).

## Alternatives considered

- Stateless JWT sessions: no server-side revocation and larger blast radius if the secret leaks.
- Third-party auth libraries: more surface than needed for a single owner; can be introduced when multi-user mode arrives.

## Consequences

- Multi-instance deployments need a shared rate-limit store (documented limitation).
- Multi-user mode later only needs registration/invitation flows; the session and ownership model already apply.
