# ADR 0002: AI selects and rewords; the application validates every claim against confirmed facts

Date: 2026-11-08 · Status: accepted

## Context

Truthfulness is the first product principle. Models can hallucinate, and job descriptions may contain prompt-injection text. We cannot rely on the model's own promises.

## Decision

- The AI's tailoring output is a _selection_ structure: experience ids, bullets with `sourceIds`, skill ordering, section order, summary with sources. It never produces employers, titles or dates.
- `buildTailoredContent` composes the resume from the confirmed profile plus those selections, then `validateClaims` enforces: existing same-parent evidence references, number preservation, no unsupported sensitive terms (job skills + technical vocabulary), immutable employment facts, confirmed-only skills/education/certifications.
- Rejected claims are dropped and listed in the change report; if nothing usable remains the generation fails and nothing is saved.
- Only `status: confirmed` profile entries are eligible evidence; imported data must be confirmed by the owner first.
- Untrusted text is wrapped in data blocks with injected tags stripped.

## Consequences

- Scenario F (job requires an unverified skill) is enforced deterministically and covered by tests, independent of the provider.
- Some legitimate rewordings may be rejected (for example introducing a synonym that is also a job keyword); the user sees why and can edit manually in the editor, which does not re-validate user-authored text.
- The evidence matcher and term check are heuristics; they are transparent (reported, not scored) and documented as such.
