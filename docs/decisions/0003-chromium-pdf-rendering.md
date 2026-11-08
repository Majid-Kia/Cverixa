# ADR 0003: HTML/CSS templates rendered to PDF by server-side Chromium

Date: 2026-11-08 · Status: accepted

## Context

PDFs must be deterministic, selectable-text, Inter-embedded, A4/Letter, multi-page safe, and the browser preview should match the PDF as closely as practical.

## Decision

Templates are pure functions returning complete HTML documents with inline CSS and base64-embedded Inter `@font-face` rules. Playwright's Chromium renders them with JavaScript disabled, every network request blocked and print media emulated; `page.pdf` uses CSS page size and produces tagged PDFs. The same HTML (preview mode) feeds the in-app preview iframe, so content and typography are identical; pagination is confirmed through a server round-trip that renders the real PDF.

Validation re-reads the PDF with unpdf (text extraction) and inspects `/BaseFont` names to confirm only Inter is referenced.

## Alternatives considered

- PDF libraries with their own layout engines (react-pdf, pdfkit): weaker typography/pagination control and a second layout implementation for the preview.
- LaTeX-based rendering: excellent output but heavy toolchain and hard to keep in sync with a browser preview.

## Consequences

- Chromium is a runtime dependency; the Docker image is based on the Playwright image and the Playwright-managed browser is used locally.
- A single browser instance is reused per process; each render uses an isolated context.
- Visual pixel regression is not yet automated; overflow and extraction checks cover the PRD's acceptance criteria for now.
