import { describe, expect, it } from "vitest";
import { clip, toJobAnalysis } from "@/features/job-analysis/normalize";
import { jobAnalysisAiOutputSchema } from "@/features/job-analysis/schema";

const JOB = { originalText: "Senior Frontend Engineer. Send a cover letter with your application.", title: "" };
const LONG_SENIORITY =
  "Senior level: the posting asks for someone with at least five years of professional frontend experience who can lead projects independently and mentor others";

describe("job analysis from model output", () => {
  it("accepts a seniority longer than the stored limit instead of failing (regression)", () => {
    expect(LONG_SENIORITY.length).toBeGreaterThan(100);
    const analysis = toJobAnalysis(
      jobAnalysisAiOutputSchema.parse({
        jobTitle: "Senior Frontend Engineer",
        seniority: LONG_SENIORITY,
        requirements: [{ category: "technical_skill", description: "React", relatedSkills: ["React"] }],
      }),
      JOB,
    );
    expect(analysis).not.toBeNull();
    expect(analysis!.seniority.length).toBeLessThanOrEqual(100);
    expect(LONG_SENIORITY.startsWith(analysis!.seniority)).toBe(true);
    expect(analysis!.seniority.endsWith(" ")).toBe(false);
    expect(analysis!.requirements).toHaveLength(1);
  });

  it("cuts every other over-long field and drops unusable entries", () => {
    const analysis = toJobAnalysis(
      jobAnalysisAiOutputSchema.parse({
        jobTitle: "T".repeat(400),
        seniority: "Senior",
        summary: "word ".repeat(900),
        requirements: [
          {
            category: "technical_skill",
            description: "d".repeat(900),
            supportingText: "s".repeat(3000),
            relatedSkills: ["k".repeat(300), "  ", "React"],
          },
          { category: "responsibility", description: "   " },
        ],
        applicationRequirements: [
          {
            kind: "cover_letter",
            description: "c".repeat(900),
            supportingText: "Send a cover letter with your application.",
          },
          { kind: "portfolio", description: "Portfolio", supportingText: "A portfolio is required." },
        ],
      }),
      JOB,
    )!;
    expect(analysis.jobTitle).toHaveLength(200);
    expect(analysis.summary.length).toBeLessThanOrEqual(2000);
    expect(analysis.requirements).toHaveLength(1);
    expect(analysis.requirements[0].description).toHaveLength(500);
    expect(analysis.requirements[0].supportingText).toHaveLength(1000);
    expect(analysis.requirements[0].relatedSkills.map((skill) => skill.length)).toEqual([100, 5]);
    expect(analysis.applicationRequirements.map((item) => item.kind)).toEqual(["cover_letter"]);
    expect(analysis.applicationRequirements[0].description).toHaveLength(500);
  });

  it("falls back to the stated job title and keeps short values untouched", () => {
    const analysis = toJobAnalysis(jobAnalysisAiOutputSchema.parse({ seniority: " Senior " }), {
      ...JOB,
      title: "Frontend Engineer",
    })!;
    expect(analysis.jobTitle).toBe("Frontend Engineer");
    expect(analysis.seniority).toBe("Senior");
  });

  it("clips at a word boundary without trailing punctuation", () => {
    expect(clip("Senior level, with leadership duties", 14)).toBe("Senior level");
    expect(clip("short", 14)).toBe("short");
    expect(clip("x".repeat(30), 10)).toBe("x".repeat(10));
  });
});
