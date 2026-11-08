# ADR 0001: Modular monolith on Next.js App Router

Date: 2026-11-08 · Status: accepted

## Context

The PRD mandates Next.js, TypeScript, Tailwind, PostgreSQL/Prisma and a single repository without microservices. The MVP is single-user but must be deployable on the internet and later extensible to multi-user.

## Decision

One Next.js application with feature modules under `src/features/*` and infrastructure under `src/server/*`. Server components and server actions handle most data access; route handlers exist only where a non-HTML response is needed (PDF, preview HTML, model listing, health). `src/app` is kept thin: pages compose feature services and components. Next.js 16's `cacheComponents` is disabled because every authenticated page is dynamic.

## Consequences

- Simple deployment (one container), no cross-service contracts.
- Feature modules can be extracted later if needed; boundaries are enforced by import direction (see docs/architecture.md).
- Ownership columns on every entity prepare multi-user mode without implementing it now.
