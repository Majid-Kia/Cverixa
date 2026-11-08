import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { numericTokens, validateClaims } from "@/features/resume-tailoring/validate-claims";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";

describe("validateClaims (Stage 5 factual integrity)", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const analysis = sampleJobAnalysis();

  it("passes unchanged baseline content", () => {
    const result = validateClaims(profile, analysis, buildBaselineContent(profile));
    expect(result.status).toBe("passed");
    expect(result.rejected).toEqual([]);
  });

  it("rejects a bullet claiming a job-required skill the user never used (Scenario F)", () => {
    const content = buildBaselineContent(profile);
    content.experience[0].bullets.push({
      id: "b_fake",
      text: "Deployed services to Kubernetes clusters across three regions.",
      sourceIds: ["ach_acme_1"],
      kind: "reworded",
    });
    const result = validateClaims(profile, analysis, content);
    expect(result.status).toBe("passed_with_rejections");
    expect(result.content.experience[0].bullets.some((bullet) => bullet.id === "b_fake")).toBe(false);
    expect(result.rejected[0].reason).toMatch(/kubernetes/i);
  });

  it("rejects bullets without evidence references", () => {
    const content = buildBaselineContent(profile);
    content.experience[0].bullets.push({
      id: "b_noref",
      text: "Did something impressive.",
      sourceIds: [],
      kind: "composed",
    });
    const result = validateClaims(profile, analysis, content);
    expect(result.rejected.some((claim) => claim.reason.includes("No evidence reference"))).toBe(true);
  });

  it("rejects fabricated numeric metrics", () => {
    const content = buildBaselineContent(profile);
    content.experience[0].bullets[0] = {
      id: "b_num",
      text: "Reduced dashboard load time by 75% by introducing route-based code splitting.",
      sourceIds: ["ach_acme_1"],
      kind: "reworded",
    };
    const result = validateClaims(profile, analysis, content);
    expect(result.rejected.some((claim) => claim.reason.includes('"75"'))).toBe(true);
  });

  it("accepts rewording that preserves verified numbers and cited technologies", () => {
    const content = buildBaselineContent(profile);
    content.experience[0].bullets[0] = {
      id: "b_ok",
      text: "Cut merchant dashboard load time 40% via route-based code splitting in React.",
      sourceIds: ["ach_acme_1"],
      kind: "reworded",
    };
    const result = validateClaims(profile, analysis, content);
    expect(result.rejected).toEqual([]);
  });

  it("rejects evidence references that belong to another role", () => {
    const content = buildBaselineContent(profile);
    content.experience[1].bullets.push({
      id: "b_cross",
      text: "Reduced load time by 40%.",
      sourceIds: ["ach_acme_1"],
      kind: "reworded",
    });
    const result = validateClaims(profile, analysis, content);
    expect(result.rejected.some((claim) => claim.reason.includes("different role"))).toBe(true);
  });

  it("restores altered employment dates and titles from the profile", () => {
    const content = buildBaselineContent(profile);
    content.experience[0].title = "VP of Engineering";
    content.experience[0].startDate = "Jan 2015";
    const result = validateClaims(profile, analysis, content);
    expect(result.content.experience[0].title).toBe("Senior Frontend Engineer");
    expect(result.content.experience[0].startDate).toBe("Mar 2021");
    expect(result.rejected.some((claim) => claim.reason.includes("Employment details"))).toBe(true);
  });

  it("drops roles and skills that are not in the confirmed profile", () => {
    const content = buildBaselineContent(profile);
    content.experience.push({
      id: "exp_fake",
      employer: "Fake Corp",
      title: "CTO",
      location: "",
      startDate: "2000",
      endDate: "",
      bullets: [],
      technologies: [],
    });
    content.skills.push({ id: "skill_fake", name: "Java", category: "Languages" });
    const result = validateClaims(profile, analysis, content);
    expect(result.content.experience.some((entry) => entry.id === "exp_fake")).toBe(false);
    expect(result.content.skills.some((skill) => skill.id === "skill_fake")).toBe(false);
  });

  it("falls back to the profile summary when the generated summary is unsupported", () => {
    const content = buildBaselineContent(profile);
    content.summary = { text: "Java expert with 15 years of Kubernetes experience.", sourceIds: ["ach_acme_1"] };
    const result = validateClaims(profile, analysis, content);
    expect(result.content.summary.text).toBe(profile.summary.text);
    expect(result.rejected.some((claim) => claim.location === "Summary")).toBe(true);
  });

  it("reports failure when nothing survives validation", () => {
    const content = buildBaselineContent(profile);
    content.experience = content.experience.map((entry) => ({
      ...entry,
      bullets: [{ id: "x", text: "Kubernetes wizardry", sourceIds: [], kind: "composed" as const }],
    }));
    content.projects = [];
    content.summary = { text: "Kubernetes and Java guru", sourceIds: [] };
    const result = validateClaims(profile, analysis, content);
    expect(result.status).toBe("passed_with_rejections");
    expect(result.content.summary.text).toBe(profile.summary.text);
  });

  it("extracts numeric tokens", () => {
    expect(numericTokens("Grew revenue 1,200% to $3.5M in 2021")).toEqual(["1200", "3.5", "2021"]);
  });
});
