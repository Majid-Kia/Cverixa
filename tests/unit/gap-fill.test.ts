import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { jobAnalysisSchema } from "@/features/job-analysis/schema";
import { buildBaselineContent, buildTailoredContent } from "@/features/resume-tailoring/build-content";
import { matchEvidence } from "@/features/resume-tailoring/evidence";
import {
  applySupplied,
  hasSupplied,
  listCredentialGaps,
  listGaps,
  planSupplied,
} from "@/features/resume-tailoring/gap-fill";
import { acceptedSupplied, applyDecisions, createProposals } from "@/features/resume-tailoring/proposals";
import { tailoringAiOutputSchema } from "@/features/resume-tailoring/schema";
import { mockGapFill, mockTailoring } from "@/server/ai/providers/mock";
import { PARTLY, candidateProfile } from "../fixtures/application-cases";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";
import { analyse } from "../helpers/tailor";

const noModel = { skills: [], bullets: [] };

describe("gaps that may be covered", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const analysis = jobAnalysisSchema.parse({
    requirements: [
      ...sampleJobAnalysis().requirements,
      {
        id: "req_customers",
        category: "responsibility",
        description: "Run discovery workshops with enterprise buyers",
        classification: "preferred",
      },
      { id: "req_degree", category: "qualification", description: "PhD in astrophysics", classification: "mandatory" },
      {
        id: "req_cert",
        category: "technical_skill",
        description: "Certified Kubernetes Administrator",
        relatedSkills: ["CKA"],
      },
      { id: "req_years", category: "qualification", description: "Experience shipping payment products" },
      { id: "req_visa", category: "restriction", description: "Must hold a Canadian passport" },
    ],
  });
  const evidence = matchEvidence(profile, analysis);
  const content = buildBaselineContent(profile);

  it("lists every requirement that is not fully supported, except credentials and eligibility", () => {
    const gaps = listGaps(analysis, evidence);
    expect(gaps.map((gap) => [gap.requirementId, gap.kind, gap.skills])).toEqual([
      // Partly supported: the profile mentions frontend architecture once. Covered too.
      ["req_arch", "experience", []],
      ["req_k8s", "skill", ["Kubernetes"]],
      ["req_java", "skill", ["Java"]],
      ["req_customers", "experience", []],
      // A qualification that is about experience, not a credential.
      ["req_years", "experience", []],
    ]);
    // A partly supported gap points at the role that already holds related evidence.
    expect(gaps[0].entryId).toBe("exp_acme");
    expect(gaps[3]).toEqual(expect.objectContaining({ missing: "", entryId: "" }));
  });

  it("never supplies degrees, certifications or eligibility; it lists them for the owner", () => {
    expect(listCredentialGaps(analysis, evidence)).toEqual([
      "PhD in astrophysics",
      "Certified Kubernetes Administrator",
      "Must hold a Canadian passport",
    ]);
    const supplied = planSupplied({
      profile,
      analysis,
      evidence,
      content,
      model: {
        skills: [{ requirementId: "req_cert", name: "CKA", category: "" }],
        bullets: [
          { requirementId: "req_degree", entryId: "exp_acme", text: "Earned a doctorate in astrophysics." },
          { requirementId: "req_visa", entryId: "exp_acme", text: "Canadian citizen with a valid passport." },
        ],
      },
    });
    expect(supplied.credentials).toHaveLength(3);
    expect(supplied.bullets).toEqual([]);
    expect(supplied.skills.some((skill) => skill.requirementId === "req_cert")).toBe(false);
    expect(JSON.stringify(applySupplied(content, supplied))).not.toMatch(/doctorate|passport|CKA|Certified Kubernetes/);
  });

  it("adds the posting's skill names and marks them as supplied", () => {
    const supplied = planSupplied({ profile, analysis, evidence, content, model: noModel });
    expect(supplied.skills.map((skill) => [skill.name, skill.category, skill.requirementId])).toEqual([
      ["Kubernetes", "Other", "req_k8s"],
      ["Java", "Other", "req_java"],
    ]);
    // No usable bullet from the model: the experience gap is reported, not improvised.
    expect(supplied.bullets).toEqual([]);
    expect(supplied.uncovered).toEqual([
      "Own frontend architecture decisions",
      "Run discovery workshops with enterprise buyers",
      "Experience shipping payment products",
    ]);

    const result = applySupplied(content, supplied);
    expect(result.skills.slice(-2)).toEqual([
      expect.objectContaining({ name: "Kubernetes", supplied: true }),
      expect.objectContaining({ name: "Java", supplied: true }),
    ]);
    expect(content.skills.some((skill) => skill.name === "Kubernetes")).toBe(false);
    expect(applySupplied(result, supplied).skills).toHaveLength(result.skills.length);
  });

  it("takes model skill names only when the requirement names them", () => {
    const supplied = planSupplied({
      profile,
      analysis,
      evidence,
      content,
      model: {
        skills: [
          { requirementId: "req_k8s", name: "Kubernetes", category: "frameworks" },
          { requirementId: "req_k8s", name: "Certified Kubernetes Administrator", category: "" },
          { requirementId: "req_java", name: "PhD", category: "" },
          { requirementId: "req_react", name: "Angular", category: "" },
        ],
        bullets: [],
      },
    });
    expect(supplied.skills.map((skill) => [skill.name, skill.category])).toEqual([
      ["Kubernetes", "Frameworks"],
      ["Java", "Other"],
    ]);
  });

  it("accepts a plain bullet for an experience gap and rejects numbers, links and unknown roles", () => {
    const model = (text: string, entryId = "exp_shop") => ({
      skills: [],
      bullets: [{ requirementId: "req_customers", entryId, text }],
    });
    const good = planSupplied({
      profile,
      analysis,
      evidence,
      content,
      model: model("  Ran discovery workshops with enterprise buyers\n to shape the roadmap. "),
    });
    expect(good.bullets).toEqual([
      expect.objectContaining({
        requirementId: "req_customers",
        entryId: "exp_shop",
        entryLabel: "Frontend Engineer at ShopNow",
        text: "Ran discovery workshops with enterprise buyers to shape the roadmap.",
        replacesSourceIds: [],
      }),
    ]);
    expect(good.uncovered).not.toContain("Run discovery workshops with enterprise buyers");
    const applied = applySupplied(content, good);
    expect(applied.experience[1].bullets.at(-1)).toEqual(
      expect.objectContaining({ kind: "supplied", sourceIds: [], text: good.bullets[0].text }),
    );

    for (const text of [
      "Ran 40 discovery workshops with enterprise buyers.",
      "Ran discovery workshops, see https://example.com for details.",
      "Too short.",
    ]) {
      expect(planSupplied({ profile, analysis, evidence, content, model: model(text) }).bullets).toEqual([]);
    }
    const fallback = planSupplied({
      profile,
      analysis,
      evidence,
      content,
      model: model("Ran discovery workshops with enterprise buyers.", "exp_invented"),
    });
    expect(fallback.bullets[0].entryId).toBe("exp_acme");
    // A requirement that is evidenced, or of a kind that is never supplied, gets nothing.
    const stray = planSupplied({
      profile,
      analysis,
      evidence,
      content,
      model: {
        skills: [],
        bullets: [{ requirementId: "req_degree", entryId: "exp_acme", text: "Earned a doctorate in astrophysics." }],
      },
    });
    expect(stray.bullets).toEqual([]);
  });
});

describe("covering gaps for a reviewed application", () => {
  const profile = confirmedFactsOnly(candidateProfile());
  const analysis = analyse(PARTLY.text);
  const evidence = matchEvidence(profile, analysis);
  const aiOutput = tailoringAiOutputSchema.parse(mockTailoring(profile, analysis));
  const built = buildTailoredContent({ profile, analysis, evidence, aiOutput });
  const gaps = listGaps(analysis, evidence);
  const supplied = planSupplied({
    profile,
    analysis,
    evidence,
    content: built.content,
    model: mockGapFill({ gapsToCover: gaps }, profile),
  });

  it("swaps in at most two bullets per role, only for routine responsibilities, and adds the rest", () => {
    expect(gaps.map((gap) => gap.kind)).toEqual(["experience", "experience", "experience"]);
    expect(supplied.bullets).toHaveLength(3);
    expect(supplied.bullets.map((bullet) => bullet.replacedText)).toEqual([
      "Review pull requests and mentor two junior engineers.",
      "Lead frontend development for the purchase and account areas in React, TypeScript and Next.js.",
      "",
    ]);
    const before = built.content.experience[0].bullets;
    const after = applySupplied(built.content, supplied).experience[0].bullets;
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((bullet) => bullet.kind === "supplied")).toHaveLength(3);
    // Achievements are never swapped out.
    for (const id of ["ach_nw_lcp", "ach_nw_tests", "ach_nw_ts", "ach_nw_ds"]) {
      expect(after.some((bullet) => bullet.sourceIds.includes(id))).toBe(true);
    }
    expect(hasSupplied(supplied)).toBe(true);
  });

  it("offers each addition as its own proposal and applies only what is accepted", () => {
    const baseline = buildBaselineContent(profile);
    const proposals = createProposals(baseline, built.content, supplied);
    const additions = proposals.filter((proposal) => proposal.kind === "supplied_bullet");
    expect(additions).toHaveLength(3);
    expect(additions[0].label).toBe(
      "Added to cover: Work directly with customers to understand how they do their work today",
    );
    expect(additions[0].note).toMatch(
      /Not from your profile\. Placed under Senior Frontend Engineer at Northwind Commerce/,
    );
    expect(additions[0].original).toEqual(["Review pull requests and mentor two junior engineers."]);

    // Undecided or rejected additions never reach the resume.
    const none = acceptedSupplied(supplied, [{ proposalId: additions[0].id, decision: "reject" }]);
    expect(hasSupplied(none)).toBe(false);
    const untouched = applySupplied(applyDecisions(baseline, built.content, proposals, []), none);
    expect(untouched.experience).toEqual(baseline.experience);

    const some = acceptedSupplied(supplied, [
      {
        proposalId: additions[0].id,
        decision: "accept",
        editedLines: ["Sat with warehouse teams to map their daily workflow."],
      },
      { proposalId: additions[1].id, decision: "reject" },
    ]);
    expect(some?.bullets.map((bullet) => bullet.text)).toEqual([
      "Sat with warehouse teams to map their daily workflow.",
    ]);
    const final = applySupplied(applyDecisions(baseline, built.content, proposals, []), some);
    const northwind = final.experience[0].bullets;
    expect(northwind.filter((bullet) => bullet.kind === "supplied").map((bullet) => bullet.text)).toEqual([
      "Sat with warehouse teams to map their daily workflow.",
    ]);
    expect(northwind.some((bullet) => bullet.text === "Review pull requests and mentor two junior engineers.")).toBe(
      false,
    );
    expect(northwind).toHaveLength(baseline.experience[0].bullets.length);
  });

  it("lets the owner trim the supplied skill list in review", () => {
    const withSkills = {
      ...supplied,
      skills: [
        { id: "s1", requirementId: "r1", requirement: "Kubernetes", name: "Kubernetes", category: "Other" },
        { id: "s2", requirementId: "r2", requirement: "Java", name: "Java", category: "Other" },
      ],
    };
    const kept = acceptedSupplied(withSkills, [
      { proposalId: "supplied:skills", decision: "accept", editedLines: ["Kubernetes", " "] },
    ]);
    expect(kept?.skills.map((skill) => skill.name)).toEqual(["Kubernetes"]);
    expect(acceptedSupplied(withSkills, [])?.skills).toEqual([]);
  });

  it("changes nothing when gap filling is not requested", () => {
    expect(applySupplied(built.content, null)).toBe(built.content);
    expect(built.changeReport.supplied).toBeNull();
    expect(JSON.stringify(built.content)).not.toMatch(/"supplied"/);
  });
});
