import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { exportResumePdf } from "@/features/resume-rendering/export-resume";
import { closeBrowser } from "@/features/resume-rendering/pdf";
import { TEMPLATES } from "@/templates";
import type { PageFormat } from "@/types/resume-content";
import { PARTLY, POLARSTEPS, SEAMFLOW, candidateProfile } from "../fixtures/application-cases";
import { longProfile, minimalProfile, sampleProfile } from "../fixtures/profiles";
import { tailor } from "../helpers/tailor";

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

/**
 * The three reviewed applications, checked on the PDF itself: the strongest
 * supported project must be on page one, described once, with the source role
 * still in its place in the chronology.
 */
describe("exported PDF for the reviewed applications", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  const squash = (text: string) => text.replace(/\s+/g, " ");
  const count = (text: string, needle: string) => squash(text).split(needle).length - 1;
  const profile = confirmedFactsOnly(candidateProfile());
  const PORTAL = "Built the fraud-detection portal that analysts use";
  const TOURS = "Built the tour-booking system with search and filtering";
  const CASES = [
    { posting: PARTLY, project: PORTAL, heading: "Fraud-detection portal", from: "Frontend Engineer, Ledgerline" },
    { posting: POLARSTEPS, project: TOURS, heading: "Tour-booking system", from: "Frontend Developer, Zoomit" },
    { posting: SEAMFLOW, project: PORTAL, heading: "Fraud-detection portal", from: "Frontend Engineer, Ledgerline" },
  ];

  it("reproduces the problem: untailored, both projects fall on page two", async () => {
    const baseline = await exportResumePdf(buildBaselineContent(profile), {
      templateId: "engineering-modern",
      pageFormat: "A4",
    });
    expect(baseline.pageCount).toBe(2);
    expect(squash(baseline.validation.pages[0])).not.toContain(PORTAL);
    expect(squash(baseline.validation.pages[0])).not.toContain(TOURS);
    expect(squash(baseline.validation.pages[1])).toContain(PORTAL);
    expect(squash(baseline.validation.pages[1])).toContain(TOURS);
  });

  for (const item of CASES) {
    for (const template of TEMPLATES) {
      it(`${item.posting.company} / ${template.id}: the project is on page one, once, attributed to its role`, async () => {
        const { built } = tailor(profile, item.posting.text);
        const result = await exportResumePdf(built.content, { templateId: template.id, pageFormat: "A4" });
        writeFileSync(
          path.join(OUTPUT_DIR, `case-${item.posting.company.toLowerCase()}-${template.id}.pdf`),
          result.pdf,
        );
        const first = squash(result.validation.pages[0]);
        const whole = result.validation.pages.join(" ");
        expect(result.validation.problems).toEqual([]);
        expect(first).toContain(item.project);
        expect(first.toLowerCase()).toContain("selected project");
        expect(first).toContain(item.heading);
        expect(first).toContain(item.from);
        expect(count(whole, item.project)).toBe(1);
        // Chronology: every role is still listed, in order, with the source role in place.
        const order = ["Northwind Commerce", "Corvid Health", "Ledgerline", "Zoomit"].map((employer) =>
          squash(whole).lastIndexOf(employer),
        );
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(order.every((index) => index >= 0)).toBe(true);
        // A nearly empty last page depends on the template; it is covered by its own test below.
        expect(result.qualityWarnings.filter((warning) => warning.code !== "trailing_page")).toEqual([]);
      });
    }
  }

  it("Polarsteps keeps the strongest engineering evidence on page one next to the tour-booking project", async () => {
    const { built } = tailor(profile, POLARSTEPS.text);
    const result = await exportResumePdf(built.content, { templateId: "classic-clear", pageFormat: "A4" });
    const first = squash(result.validation.pages[0]);
    expect(first).toContain(TOURS);
    expect(first).toContain("Cut largest contentful paint on product pages from 4.1s to 2.3s");
    expect(first).toContain("Raised end-to-end test coverage of the purchase flow from 35% to 80% with Playwright");
    expect(first).toContain("Migrated 180 React components to strict TypeScript");
  });

  it("flags a last page that holds only a few lines", async () => {
    // Grow the oldest role until the resume spills onto a new page; the page it
    // spills onto then holds only the tail of the document.
    const content = buildBaselineContent(profile);
    const zoomit = content.experience[content.experience.length - 1];
    const before = await exportResumePdf(content, { templateId: "classic-clear", pageFormat: "A4" });
    let result = before;
    for (let added = 0; added < 40 && result.pageCount === before.pageCount; added += 1) {
      zoomit.bullets.push({
        id: `filler_${added}`,
        text: `Maintained booking page template number ${added + 1} for the marketing site.`,
        sourceIds: [],
        kind: "original",
      });
      result = await exportResumePdf(content, { templateId: "classic-clear", pageFormat: "A4" });
    }
    expect(result.pageCount).toBe(before.pageCount + 1);
    const trailing = result.qualityWarnings.find((warning) => warning.code === "trailing_page");
    expect(trailing?.message).toMatch(/ends on page 3 with only about \d+ lines?/);
    expect(before.qualityWarnings.some((warning) => warning.code === "trailing_page")).toBe(false);
  }, 180_000);

  it('flags duplicate skill labels and the "1+ years" headline in the export (regression)', async () => {
    const content = buildBaselineContent(profile);
    content.personal.headline = "Frontend Engineer | 1+ years of experience";
    content.skills.push({ id: "skill_react_again", name: "React", category: "Libraries" });
    const result = await exportResumePdf(content, { templateId: "classic-clear", pageFormat: "A4" });
    expect(squash(result.validation.pages[0])).toContain("1+ years of experience");
    const warnings = result.qualityWarnings.filter((warning) => warning.code !== "trailing_page");
    expect(warnings.map((warning) => warning.code)).toEqual(["duplicate_skill_label", "headline_mismatch"]);
    expect(warnings[1].message).toMatch(/"1\+ years" but the roles listed span about 11 years/);
    // The corrected headline exports clean.
    const corrected = await exportResumePdf(buildBaselineContent(profile), {
      templateId: "classic-clear",
      pageFormat: "A4",
    });
    expect(corrected.qualityWarnings.filter((warning) => warning.code !== "trailing_page")).toEqual([]);
  });
});
