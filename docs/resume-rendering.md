# Resume rendering

One authoritative server-side pipeline turns validated `ResumeContent` into a PDF (PRD NFR-002). AI is never involved in layout.

```text
ResumeRevision.content
  -> resumeContentSchema.parse
  -> template.render(content, { pageFormat, fontFaceCss })   (src/templates/*)
  -> renderPdf(html, pageFormat)                              (Playwright Chromium, JS disabled, network blocked)
  -> validateResumePdf(pdf, { mustContain: [fullName] })     (unpdf text extraction + /BaseFont inspection)
  -> download (Content-Disposition attachment, no-store)
```

## Templates (FR-007)

| Id                   | Name               | Character                                                                                   | Margins       |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------- | ------------- |
| `classic-clear`      | Classic Clear      | Single column, centred header, uppercase section headings with thin rules, generous spacing | 16 mm / 18 mm |
| `jake-inspired`      | Jake-Inspired      | Compact single column, dense, italic employer line, strong rules                            | 12 mm / 14 mm |
| `engineering-modern` | Engineering Modern | Two-column grid with a left date column, subtle hierarchy, header rule                      | 15 mm / 17 mm |

All three are original implementations in `src/templates/<id>/index.ts`. They accept the same `ResumeContent`, never mutate it, escape every value (`esc`) and only emit `http(s)`/`mailto` links (`safeHref`). Section rendering honours `sectionOrder`, `hiddenSections` and skips empty sections. Templates share `src/templates/shared/index.ts` (escaping, link handling, skill grouping, document shell, print-safety CSS).

## Typography (FR-008)

Inter is bundled from `@fontsource/inter` (SIL OFL, licence in `public/fonts/LICENSE-Inter-OFL.txt`), weights 400/500/600/700, latin subset, embedded as `data:` URIs in every rendered document so neither the browser nor Chromium needs installed fonts or network access. Default sizes follow the PRD table: name 22 pt bold, headline 12 pt medium, section headings 11.5 pt semibold, body 10.5 pt, job titles 10.5 pt semibold, dates/contact 9.5 pt. Jake-Inspired uses a 10 pt body as a controlled variation.

## Page settings and pagination

- `@page { size: A4|Letter portrait; margin: ... }` with `preferCSSPageSize: true`.
- `break-inside: avoid` on entries, `break-after: avoid` on headings, `orphans/widows: 2` on bullets.
- `overflow-wrap: anywhere` on text and links so long URLs and company names wrap instead of clipping.
- No fixed page limit: content flows to as many pages as needed; the PRD's two-page target is a guideline surfaced through the page count, never enforced by dropping content.

## Preview (FR-009)

The editor (`src/features/resume-rendering/resume-editor.tsx`) posts the current content to `/api/resumes/[id]/preview`, which renders the same template in preview mode (a page-width frame, no print rules) and returns HTML displayed in a sandboxed iframe with a strict CSP. Preview updates are debounced (400 ms). The browser cannot paginate identically to Chromium's print engine, so **Check pagination** calls `/api/resumes/[id]/layout`, which renders a real PDF and returns the page count and layout warnings. The exported PDF is the final authority.

## Validation (stage 8)

`validateResumePdf` checks:

- text is extractable and contains the expected strings (candidate name; tests also check every bullet, headings, skills);
- `/BaseFont` entries reference only Inter subsets (fails if Inter is missing or another font leaked in);
- optional page-count bounds.

`exportResumePdf` then runs `checkExportQuality` (`content-checks.ts`) on the text of each rendered page and returns `qualityWarnings`:

- `trailing_page`: the last page holds only a few lines (typically the tail of Skills or Languages);
- `duplicate_skill_label`: a skill listed twice, or an additional section whose heading repeats a built-in one;
- `headline_mismatch`: a years-of-experience claim the listed roles do not bear out (for example "1+ years" above eleven years of roles), a figure that disagrees with the summary, a junior headline above a senior title, or a technology named only in the headline;
- `featured_not_on_first_page`: the selected project did not land on page one.

Warnings never block a download. They are returned by `/api/resumes/[id]/layout`, shown in the editor (which checks the saved version once when it is opened), logged on export and counted in the `x-resume-warnings` response header.

`renderPdf` additionally reports `horizontal_overflow` (document wider than the page) and `empty_document` warnings measured inside Chromium.

## Tests

`tests/pdf/render.test.ts` renders every template against short, minimal and long fixtures in A4 and Letter and asserts: no validation problems, Inter embedded, no overflow warnings, page counts within bounds, deterministic text/font results for identical input, and that long URLs/company names do not overflow. It also renders three reviewed applications (`tests/fixtures/application-cases.ts`) and asserts on the PDF that the selected project is on page one, appears once and keeps its source role, and that the trailing-page, duplicate-label and headline checks fire. Rendered PDFs are written to `tests/pdf/output` (ignored by git, uploaded as CI artifacts) for manual inspection.

Pixel-level visual regression is not implemented yet; see README "Known limitations".
