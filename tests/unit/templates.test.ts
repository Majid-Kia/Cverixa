import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { interFontFaceCss } from "@/features/resume-rendering/fonts";
import { renderResumeHtml } from "@/features/resume-rendering/render-html";
import { DEFAULT_TEMPLATE_ID, TEMPLATES, getTemplate, isTemplateId } from "@/templates";
import { esc, safeHref } from "@/templates/shared";
import { sampleProfile } from "../fixtures/profiles";

describe("template registry (FR-007)", () => {
  it("provides exactly three templates with unique ids", () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual(["classic-clear", "jake-inspired", "engineering-modern"]);
    expect(isTemplateId("jake-inspired")).toBe(true);
    expect(isTemplateId("nope")).toBe(false);
    expect(getTemplate("nope").id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("renders the same content through every template without mutating it", () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    const snapshot = JSON.stringify(content);
    for (const template of TEMPLATES) {
      const html = renderResumeHtml(content, { templateId: template.id, pageFormat: "A4" });
      expect(html).toContain("Alex Rivera");
      expect(html).toContain("Acme Payments");
      expect(html).toContain("Reduced dashboard load time by 40%");
      expect(html).toContain('font-family: "Inter"');
      expect(html).toContain("@page { size: A4 portrait");
      expect(html).toContain('href="https://github.com/alexrivera"');
    }
    expect(JSON.stringify(content)).toBe(snapshot);
  });

  it("supports Letter format and preview mode", () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    expect(renderResumeHtml(content, { templateId: "classic-clear", pageFormat: "Letter" })).toContain(
      "size: Letter portrait",
    );
    expect(renderResumeHtml(content, { templateId: "classic-clear", pageFormat: "A4", preview: true })).toContain(
      'class="page"',
    );
  });

  it("escapes untrusted content and blocks unsafe links", () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    content.personal.fullName = '<script>alert("x")</script>';
    content.personal.portfolioUrl = "javascript:alert(1)";
    content.experience[0].bullets[0].text = "Used <b>bold</b> & ampersands";
    const html = renderResumeHtml(content, { templateId: "engineering-modern", pageFormat: "A4" });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; ampersands");
  });

  it("omits hidden and empty sections", () => {
    const content = buildBaselineContent(confirmedFactsOnly(sampleProfile()));
    content.hiddenSections = ["languages"];
    content.certifications = [];
    const html = renderResumeHtml(content, { templateId: "jake-inspired", pageFormat: "A4" });
    expect(html).not.toContain("Languages</h2>");
    expect(html).not.toContain("Certifications</h2>");
  });

  it("embeds all four Inter weights as data URIs", () => {
    const css = interFontFaceCss();
    expect(css.match(/@font-face/g)?.length).toBe(4);
    expect(css).toContain("data:font/woff2;base64,");
  });

  it("helper functions escape and sanitise", () => {
    expect(esc("<a href='x'>&</a>")).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
    expect(safeHref("example.com/me")).toBe("https://example.com/me");
    expect(safeHref("data:text/html,hi")).toBeNull();
  });
});
