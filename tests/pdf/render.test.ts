import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { exportResumePdf } from "@/features/resume-rendering/export-resume";
import { closeBrowser } from "@/features/resume-rendering/pdf";
import { TEMPLATES } from "@/templates";
import type { PageFormat } from "@/types/resume-content";
import { longProfile, minimalProfile, sampleProfile } from "../fixtures/profiles";

const OUTPUT_DIR = path.join(process.cwd(), "tests", "pdf", "output");

const FIXTURES = [
  { name: "short", profile: () => sampleProfile(), maxPages: 2 },
  { name: "minimal", profile: () => minimalProfile(), maxPages: 1 },
  { name: "long", profile: () => longProfile(), maxPages: 8 },
];

const FORMATS: PageFormat[] = ["A4", "Letter"];

describe("PDF rendering pipeline (NFR-002, PRD 25.5)", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const template of TEMPLATES) {
    for (const fixture of FIXTURES) {
      it(`${template.id} renders the ${fixture.name} fixture with embedded Inter and extractable text`, async () => {
        const profile = confirmedFactsOnly(fixture.profile());
        const content = buildBaselineContent(profile);
        const result = await exportResumePdf(content, { templateId: template.id, pageFormat: "A4" });
        writeFileSync(path.join(OUTPUT_DIR, `${template.id}-${fixture.name}.pdf`), result.pdf);

        expect(result.validation.problems).toEqual([]);
        expect(result.validation.interEmbedded).toBe(true);
        expect(result.validation.fontNames.every((name) => /inter/i.test(name))).toBe(true);
        expect(result.validation.textLength).toBeGreaterThan(50);
        expect(result.layoutWarnings).toEqual([]);
        expect(result.pageCount).toBeGreaterThanOrEqual(1);
        expect(result.pageCount).toBeLessThanOrEqual(fixture.maxPages);
        expect(Buffer.from(result.pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
      });
    }
  }

  it("keeps the short fixture on one or two pages in both page formats", async () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    for (const format of FORMATS) {
      const result = await exportResumePdf(content, { templateId: "classic-clear", pageFormat: format });
      expect(result.pageCount).toBeLessThanOrEqual(2);
      expect(result.validation.ok).toBe(true);
    }
  });

  it("extracts every bullet and heading from the PDF text layer", async () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    const { validateResumePdf } = await import("@/features/resume-rendering/validate-pdf");
    const result = await exportResumePdf(content, { templateId: "engineering-modern", pageFormat: "A4" });
    const expectations = [
      content.personal.fullName,
      "Professional Experience",
      ...content.experience.flatMap((entry) => entry.bullets.map((bullet) => bullet.text)),
      ...content.skills.map((skill) => skill.name),
      "University of Manchester",
    ];
    const validation = await validateResumePdf(result.pdf, { mustContain: expectations });
    expect(validation.problems).toEqual([]);
  });

  it("handles long URLs and long company names without horizontal overflow", async () => {
    const content = buildBaselineContent(confirmedFactsOnly(longProfile()));
    for (const template of TEMPLATES) {
      const result = await exportResumePdf(content, { templateId: template.id, pageFormat: "Letter" });
      expect(result.layoutWarnings).toEqual([]);
      expect(result.validation.ok).toBe(true);
    }
  });

  it("renders deterministically for identical input", async () => {
    const content = buildBaselineContent(confirmedFactsOnly(minimalProfile()));
    const a = await exportResumePdf(content, { templateId: "jake-inspired", pageFormat: "A4" });
    const b = await exportResumePdf(content, { templateId: "jake-inspired", pageFormat: "A4" });
    expect(a.pageCount).toBe(b.pageCount);
    expect(a.validation.textLength).toBe(b.validation.textLength);
    expect(a.validation.fontNames).toEqual(b.validation.fontNames);
  });
});
