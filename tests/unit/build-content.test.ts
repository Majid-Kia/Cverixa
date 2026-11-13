import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import {
  buildBaselineContent,
  buildTailoredContent,
  normalizeSectionOrder,
} from "@/features/resume-tailoring/build-content";
import { matchEvidence } from "@/features/resume-tailoring/evidence";
import { tailoringAiOutputSchema, type TailoringAiOutput } from "@/features/resume-tailoring/schema";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";

describe("buildTailoredContent (Stages 4-6)", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const analysis = sampleJobAnalysis();
  const evidence = matchEvidence(profile, analysis);

  const goodOutput: TailoringAiOutput = tailoringAiOutputSchema.parse({
    summary: {
      text: "Senior frontend engineer who reduced dashboard load time by 40% and mentors engineers.",
      sourceIds: ["ach_acme_1", "stmt_acme_2"],
    },
    experience: [
      {
        id: "exp_acme",
        bullets: [
          {
            text: "Reduced dashboard load time by 40% by introducing route-based code splitting.",
            sourceIds: ["ach_acme_1"],
          },
          { text: "Mentored four junior engineers through weekly code reviews.", sourceIds: ["stmt_acme_2"] },
        ],
      },
      {
        id: "exp_shop",
        bullets: [
          { text: "Increased checkout conversion by 12% through A/B tested redesign.", sourceIds: ["ach_shop_1"] },
        ],
      },
    ],
    projects: [
      {
        id: "proj_ds",
        bullets: [{ text: "Grew the library to 2,000 GitHub stars and 35 contributors.", sourceIds: ["out_ds_1"] }],
      },
    ],
    skillIds: ["skill_ts", "skill_react", "skill_graphql"],
    sectionOrder: ["summary", "skills", "experience", "projects"],
    changeNotes: ["Prioritised React and TypeScript."],
  });

  it("builds validated content and a change report", () => {
    const result = buildTailoredContent({ profile, analysis, evidence, aiOutput: goodOutput });
    expect(result.validationStatus).toBe("passed");
    expect(result.content.experience[0].bullets.length).toBe(2);
    expect(result.content.experience[0].bullets[0].kind).toBe("original");
    expect(result.content.experience[0].bullets[1].kind).toBe("reworded");
    expect(result.content.skills.map((skill) => skill.id).slice(0, 3)).toEqual([
      "skill_ts",
      "skill_react",
      "skill_graphql",
    ]);
    expect(result.content.skills.length).toBe(profile.skills.length);
    expect(result.content.sectionOrder.slice(0, 5)).toEqual([
      "summary",
      "featured",
      "skills",
      "experience",
      "projects",
    ]);
    expect(result.content.featured).toBeNull();
    expect(result.changeReport.summaryChanged).toBe(true);
    expect(result.changeReport.rewordedBullets).toBe(1);
    expect(result.changeReport.removedBullets).toContain(
      "Own the frontend architecture for the merchant dashboard built with React and TypeScript.",
    );
    expect(result.changeReport.reorderedSkills).toBe(true);
    expect(result.changeReport.reorderedSections).toBe(true);
    expect(result.changeReport.missingRequirements.some((line) => /Kubernetes/.test(line))).toBe(true);
    expect(result.changeReport.notes).toEqual(["Prioritised React and TypeScript."]);
  });

  it("preserves immutable employment facts from the profile", () => {
    const result = buildTailoredContent({ profile, analysis, evidence, aiOutput: goodOutput });
    const acme = result.content.experience.find((entry) => entry.id === "exp_acme")!;
    expect(acme.employer).toBe("Acme Payments");
    expect(acme.startDate).toBe("Mar 2021");
    expect(acme.endDate).toBe("");
  });

  it("rejects unsupported claims and records them in the report", () => {
    const badOutput: TailoringAiOutput = {
      ...goodOutput,
      experience: [
        {
          id: "exp_acme",
          bullets: [
            { text: "Led Kubernetes migration for 50 microservices.", sourceIds: ["ach_acme_1"] },
            { text: "Reduced dashboard load time by 40%.", sourceIds: ["ach_acme_1"] },
          ],
        },
      ],
    };
    const result = buildTailoredContent({ profile, analysis, evidence, aiOutput: badOutput });
    expect(result.validationStatus).toBe("passed_with_rejections");
    expect(result.changeReport.rejectedClaims.length).toBe(1);
    expect(result.content.experience[0].bullets.map((bullet) => bullet.text)).toEqual([
      "Reduced dashboard load time by 40%.",
    ]);
    expect(result.content.experience[1].id).toBe("exp_shop");
    expect(result.content.experience[1].bullets.length).toBeGreaterThan(0);
    expect(result.changeReport.omittedExperience).toEqual([]);
  });

  it("restores the original bullets when every proposed rewrite for a role is rejected", () => {
    const aiOutput: TailoringAiOutput = {
      ...goodOutput,
      experience: [{ id: "exp_acme", bullets: [{ text: "Led 50 migrations.", sourceIds: ["not_a_source"] }] }],
    };
    const result = buildTailoredContent({ profile, analysis, evidence, aiOutput });
    const baseline = buildBaselineContent(profile);
    expect(result.content.experience.map((entry) => entry.bullets.map((bullet) => bullet.text))).toEqual(
      baseline.experience.map((entry) => entry.bullets.map((bullet) => bullet.text)),
    );
    expect(result.changeReport.rejectedClaims).toHaveLength(1);
    expect(result.changeReport.omittedExperience).toEqual([]);
    expect(result.validationStatus).toBe("passed_with_rejections");
  });

  it("ignores unknown ids from the model and falls back to original bullets", () => {
    const output: TailoringAiOutput = {
      ...goodOutput,
      experience: [{ id: "exp_unknown", bullets: [] }],
      skillIds: ["nope"],
      projects: [],
    };
    const result = buildTailoredContent({ profile, analysis, evidence, aiOutput: output });
    expect(result.content.experience.length).toBe(2);
    expect(result.content.experience[0].bullets.length).toBe(4);
    expect(result.content.projects.length).toBe(1);
  });

  it("baseline content mirrors the profile", () => {
    const baseline = buildBaselineContent(profile);
    expect(baseline.experience[0].bullets.map((bullet) => bullet.sourceIds[0])).toEqual([
      "ach_acme_1",
      "ach_acme_2",
      "stmt_acme_1",
      "stmt_acme_2",
    ]);
    expect(baseline.summary.text).toBe(profile.summary.text);
  });

  it("normalises section order", () => {
    expect(normalizeSectionOrder(["skills", "bogus", "skills"])[0]).toBe("skills");
    expect(normalizeSectionOrder([]).length).toBe(9);
    expect(normalizeSectionOrder(["skills", "summary"]).slice(0, 3)).toEqual(["skills", "summary", "featured"]);
  });
});
