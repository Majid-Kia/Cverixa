import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { containsTerm } from "@/features/job-analysis/keywords";
import { jobAnalysisSchema } from "@/features/job-analysis/schema";
import { planApplication, reconcilePlan } from "@/features/resume-tailoring/application-brief";
import { isNamedTechnology, matchEvidence } from "@/features/resume-tailoring/evidence";
import { listGaps } from "@/features/resume-tailoring/gap-fill";
import { tailoringAiOutputSchema } from "@/features/resume-tailoring/schema";
import { candidateProfile } from "../fixtures/application-cases";

/**
 * Regression: a real provider filed "Have experience building and maintaining
 * production-grade frontend applications" as a technical skill named
 * "frontend applications". The profile of a long-time frontend engineer never
 * uses that exact phrase, so Review Mode said "No evidence" while listing three
 * statements the model had correctly matched.
 */
const FRONTEND_APPS = {
  id: "req_apps",
  category: "technical_skill",
  description: "Have experience building and maintaining production-grade frontend applications",
  classification: "mandatory",
  relatedSkills: ["frontend applications"],
};
const KUBERNETES = {
  id: "req_k8s",
  category: "technical_skill",
  description: "Experience running workloads on Kubernetes",
  classification: "mandatory",
  relatedSkills: ["Kubernetes"],
};

const profile = confirmedFactsOnly(candidateProfile());
/** The same person with titles that do not name a discipline. */
const untitled = {
  ...profile,
  experience: profile.experience.map((entry) => ({ ...entry, title: "Software Engineer" })),
};

const analysisOf = (...requirements: Array<Record<string, unknown>>) => jobAnalysisSchema.parse({ requirements });
const modelPlan = (requirementId: string, sourceIds: string[], gap = "") =>
  tailoringAiOutputSchema.parse({
    evidencePlan: { criteria: [{ requirementId, sourceIds, gap }] },
    summary: { text: "" },
  }).evidencePlan;

describe("named technologies and descriptions of work", () => {
  it("tells a tool from a kind of work, and treats unknown terms as tools", () => {
    for (const name of [
      "Kubernetes",
      "Next.js",
      "CI/CD",
      "GraphQL",
      "Material UI",
      "Sentry",
      "Apache Kafka",
      "react",
    ]) {
      expect(isNamedTechnology(name), name).toBe(true);
    }
    for (const name of [
      "frontend applications",
      "Frontend Applications",
      "front-end development",
      "production-grade web applications",
      "unit testing",
      "state management",
    ]) {
      expect(isNamedTechnology(name), name).toBe(false);
    }
  });

  it("reads front-end, front end and frontend as one word", () => {
    expect(containsTerm("Senior Front-end Developer", "frontend")).toBe(true);
    expect(containsTerm("Front End Engineer", "frontend developer")).toBe(false);
    expect(containsTerm("Full-Stack Engineer", "fullstack")).toBe(true);
    expect(containsTerm("Backend Engineer", "back-end")).toBe(true);
  });
});

describe("a skill requirement that describes the work, not a tool", () => {
  it("is supported by roles whose title states the discipline", () => {
    const [match] = matchEvidence(profile, analysisOf(FRONTEND_APPS)).matches;
    expect(match.status).toBe("supported");
    expect(match.missing).toBe("");
    expect(match.evidence.filter((ref) => ref.kind === "experience").map((ref) => ref.label)).toEqual(
      expect.arrayContaining(["Senior Frontend Engineer at Northwind Commerce", "Frontend Engineer at Ledgerline"]),
    );
    // Nothing is left for gap filling to cover.
    const analysis = analysisOf(FRONTEND_APPS);
    expect(listGaps(analysis, matchEvidence(profile, analysis))).toEqual([]);

    const hyphenated = {
      ...untitled,
      experience: untitled.experience.map((entry, index) =>
        index === 0 ? { ...entry, title: "Senior Front-end Developer" } : entry,
      ),
    };
    expect(matchEvidence(hyphenated, analysisOf(FRONTEND_APPS)).matches[0].status).toBe("supported");
  });

  it("supports years-of-discipline qualifications the same way, but never a named tool", () => {
    const analysis = analysisOf(
      { id: "req_years", category: "qualification", description: "5+ years of professional frontend experience" },
      { ...KUBERNETES, description: "Frontend experience deploying to Kubernetes" },
      { id: "req_mentor", category: "responsibility", description: "Mentor frontend engineers in other squads" },
    );
    const [years, kubernetes, mentor] = matchEvidence(profile, analysis).matches;
    expect(years.status).toBe("supported");
    expect(kubernetes.status).toBe("not_evidenced");
    // A responsibility is about what was done; a title alone does not show it.
    expect(mentor.evidence.some((ref) => ref.kind === "experience")).toBe(false);
  });

  it("counts verified statements the model cites when the titles do not say it", () => {
    const analysis = analysisOf(FRONTEND_APPS);
    const initial = planApplication({ profile: untitled, analysis, jobText: "" });
    expect(initial.criteria[0].status).toBe("not_evidenced");

    const one = reconcilePlan(initial, modelPlan("req_apps", ["ach_nw_lcp", "made_up_id"]), untitled, analysis);
    expect(one.criteria[0].status).toBe("partially_supported");
    expect(one.criteria[0].missing).toBe("Only one confirmed statement speaks to this.");

    const several = reconcilePlan(
      initial,
      modelPlan("req_apps", ["ach_nw_lcp", "ach_nw_tests", "ach_ll_portal"]),
      untitled,
      analysis,
    );
    const criterion = several.criteria[0];
    expect(criterion.status).toBe("supported");
    expect(criterion.missing).toBe("");
    expect(criterion.evidence.map((ref) => [ref.id, ref.basis])).toEqual([
      ["ach_nw_lcp", "model"],
      ["ach_nw_tests", "model"],
      ["ach_ll_portal", "model"],
    ]);
    // The status shown with the criterion and the one used for gap filling agree.
    expect(several.evidence.matches[0].status).toBe("supported");
    expect(listGaps(analysis, several.evidence)).toEqual([]);

    // Ids that are not in the profile are worth nothing.
    const invented = reconcilePlan(initial, modelPlan("req_apps", ["nope_1", "nope_2"]), untitled, analysis);
    expect(invented.criteria[0].status).toBe("not_evidenced");
  });

  it("never shows evidence next to a No evidence status", () => {
    const analysis = analysisOf(FRONTEND_APPS, KUBERNETES);
    const initial = planApplication({ profile: untitled, analysis, jobText: "" });
    const model = tailoringAiOutputSchema.parse({
      evidencePlan: {
        criteria: [
          { requirementId: "req_apps", sourceIds: ["ach_nw_lcp", "ach_nw_tests"], gap: "" },
          { requirementId: "req_k8s", sourceIds: ["ach_nw_lcp", "ach_nw_tests", "ach_ll_portal"], gap: "" },
        ],
      },
      summary: { text: "" },
    }).evidencePlan;
    const plan = reconcilePlan(initial, model, untitled, analysis);
    for (const criterion of plan.criteria) {
      expect(criterion.status === "not_evidenced" && criterion.evidence.length > 0, criterion.description).toBe(false);
    }
    // Related statements never make a named tool supported, however many are cited.
    const kubernetes = plan.criteria.find((item) => item.requirementId === "req_k8s")!;
    expect(kubernetes.status).toBe("partially_supported");
    expect(kubernetes.missing).toBe("The statements above are related work, but none of them names Kubernetes.");
    expect(listGaps(analysis, plan.evidence).map((gap) => gap.requirementId)).toEqual(["req_k8s"]);
  });
});
