import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { applyDecisions, createProposals } from "@/features/resume-tailoring/proposals";
import { sampleProfile } from "../fixtures/profiles";

describe("Review Mode proposals (FR-006)", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const baseline = buildBaselineContent(profile);
  const tailored = structuredClone(baseline);
  tailored.summary = { text: "New summary", sourceIds: ["ach_acme_1"] };
  tailored.experience[0].bullets = [
    { id: "b_new", text: "Cut load time 40% with code splitting.", sourceIds: ["ach_acme_1"], kind: "reworded" },
  ];
  tailored.skills = [...tailored.skills].reverse();
  tailored.sectionOrder = [
    "skills",
    "summary",
    "experience",
    "projects",
    "education",
    "certifications",
    "languages",
    "additional",
  ];

  it("creates one proposal per changed unit", () => {
    const proposals = createProposals(baseline, tailored);
    expect(proposals.map((proposal) => proposal.kind)).toEqual([
      "summary",
      "experience_bullets",
      "skills",
      "section_order",
    ]);
    const experience = proposals.find((proposal) => proposal.kind === "experience_bullets")!;
    expect(experience.original.length).toBe(4);
    expect(experience.proposed).toEqual(["Cut load time 40% with code splitting."]);
  });

  it("keeps original content for rejected and undecided proposals", () => {
    const proposals = createProposals(baseline, tailored);
    const result = applyDecisions(baseline, tailored, proposals, [{ proposalId: "summary", decision: "reject" }]);
    expect(result.summary.text).toBe(baseline.summary.text);
    expect(result.experience[0].bullets.length).toBe(4);
    expect(result.skills[0].id).toBe(baseline.skills[0].id);
  });

  it("applies accepted proposals and user edits without touching the master profile", () => {
    const proposals = createProposals(baseline, tailored);
    const result = applyDecisions(baseline, tailored, proposals, [
      { proposalId: "summary", decision: "accept" },
      {
        proposalId: "experience:exp_acme",
        decision: "accept",
        editedLines: ["Cut load time 40% with code splitting (edited)."],
      },
      { proposalId: "skills", decision: "accept" },
      { proposalId: "sections", decision: "accept" },
    ]);
    expect(result.summary.text).toBe("New summary");
    expect(result.experience[0].bullets[0].text).toBe("Cut load time 40% with code splitting (edited).");
    expect(result.experience[0].bullets[0].sourceIds).toEqual(["ach_acme_1"]);
    expect(result.skills[0].id).toBe(baseline.skills[baseline.skills.length - 1].id);
    expect(result.sectionOrder[0]).toBe("skills");
    expect(profile.summary.text).toBe(sampleProfile().summary.text);
  });

  it("supports accepting all proposals", () => {
    const proposals = createProposals(baseline, tailored);
    const result = applyDecisions(
      baseline,
      tailored,
      proposals,
      proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" as const })),
    );
    expect(result.experience[0].bullets.length).toBe(1);
  });
});
