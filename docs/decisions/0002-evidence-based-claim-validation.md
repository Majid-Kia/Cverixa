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

## Amendment (2026-11-18): opt-in gap filling

The owner asked for requirements the profile does not fully support to be covered rather than only reported. This is allowed as an explicit, per-generation option ("Cover missing requirements", on by default in the Generate form, off in the service API). Everything else in this decision stands: validated content is still built only from confirmed facts, and supplied content is added afterwards, marked (`supplied`), limited (skill names from the posting; plain bullets without numbers; no degrees, certifications or eligibility), shown as unverified in Review Mode, the change report and the editor, and never written to the Master Career Profile. The owner is responsible for the truth of what they accept.

## Amendment (2026-11-19): credentials are entered by the owner

Degrees, certifications, licences and work eligibility stay outside gap filling: the model is never asked for them and anything it returns for such a requirement is dropped. Review Mode lists these requirements and lets the owner enter the ones they hold. The application does not draft, pre-fill or reword the entry; it only places it, and saves it to the Master Career Profile when asked. An owner-entered credential is a user-stated fact, like an answer to the review question, and does not mark the version as `with_additions`.
