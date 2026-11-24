import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { jobAnalysisSchema, type JobAnalysis } from "@/features/job-analysis/schema";
import {
  computeMatch,
  experienceYears,
  parseProfileDate,
  seniorityLevel,
  statedYears,
} from "@/features/job-scanner/rubric";
import { DEFAULT_RUBRIC, rubricSchema } from "@/features/job-scanner/schema";
import { sampleProfile as rawProfile } from "../fixtures/profiles";

/** Matching always runs on confirmed facts; the fixture also holds an unconfirmed (imported) Kubernetes skill. */
const sampleProfile = () => confirmedFactsOnly(rawProfile());

const NOW = new Date("2026-11-24T00:00:00Z");

function analysis(requirements: Array<Partial<JobAnalysis["requirements"][number]> & { description: string }>) {
  return jobAnalysisSchema.parse({
    jobTitle: "Senior Frontend Engineer",
    seniority: "Senior",
    requirements: requirements.map((requirement, index) => ({
      id: `req_${index}`,
      category: "technical_skill",
      classification: "mandatory",
      relatedSkills: [],
      ...requirement,
    })),
  });
}

const strongJob = analysis([
  { description: "5+ years of experience with React", relatedSkills: ["React"] },
  { description: "Strong TypeScript skills", relatedSkills: ["TypeScript"] },
  { description: "Experience with GraphQL APIs", relatedSkills: ["GraphQL"], classification: "preferred" },
  { description: "Mentoring junior engineers", category: "leadership", classification: "preferred" },
]);

const weakJob = analysis([
  { description: "Expert knowledge of Kubernetes", relatedSkills: ["Kubernetes"] },
  { description: "Production experience with Rust", relatedSkills: ["Rust"] },
  { description: "Experience with Kafka", relatedSkills: ["Kafka"], classification: "preferred" },
]);

describe("Job Match Score", () => {
  it("scores a well-supported job high and names the matching skills", () => {
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: strongJob,
      jobTitle: "Senior Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.matchingSkills).toEqual(expect.arrayContaining(["React", "TypeScript", "GraphQL"]));
    expect(result.missingQualifications).toEqual([]);
    expect(result.breakdown.matchingQualifications.length).toBe(4);
    expect(result.breakdown.matchingQualifications[0].evidence.length).toBeGreaterThan(0);
    expect(result.explanation).toMatch(/supports 2 of 2 mandatory requirements/);
  });

  it("scores a job the profile does not support low and lists what is missing", () => {
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: weakJob,
      jobTitle: "Senior Platform Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    expect(result.score).toBeLessThan(35);
    expect(result.matchingSkills).toEqual([]);
    expect(result.missingQualifications.map((item) => item.description)).toEqual(
      expect.arrayContaining(["Expert knowledge of Kubernetes", "Production experience with Rust"]),
    );
    expect(result.missingQualifications[0].classification).toBe("mandatory");
    expect(result.missingQualifications.every((item) => item.status === "not_evidenced")).toBe(true);
  });

  it("never credits a requirement the confirmed profile does not document", () => {
    expect(rawProfile().skills.some((skill) => skill.name === "Kubernetes" && skill.status === "imported")).toBe(true);
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: weakJob,
      jobTitle: "Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    const mandatory = result.breakdown.components.find((component) => component.id === "mandatory");
    expect(mandatory?.value).toBe(0);
    expect(result.breakdown.matchingQualifications).toEqual([]);
  });

  it("is deterministic", () => {
    const input = {
      profile: sampleProfile(),
      analysis: strongJob,
      jobTitle: "Senior Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    };
    expect(computeMatch(input)).toEqual(computeMatch(input));
  });

  it("reports each component with its weight and the points it contributed", () => {
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: strongJob,
      jobTitle: "Senior Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    const ids = result.breakdown.components.map((component) => component.id);
    expect(ids).toEqual(["mandatory", "skills", "preferred", "title", "seniority"]);
    const total = result.breakdown.components.reduce((sum, component) => sum + component.points, 0);
    expect(Math.abs(total - result.score)).toBeLessThanOrEqual(1);
    expect(result.breakdown.components.every((component) => component.detail.length > 0)).toBe(true);
  });

  it("follows configured weights", () => {
    const base = { profile: sampleProfile(), analysis: weakJob, jobTitle: "Senior Frontend Engineer", now: NOW };
    const titleOnly = rubricSchema.parse({
      weights: { mandatory: 0, skills: 0, preferred: 0, title: 100, seniority: 0 },
    });
    const requirementsOnly = rubricSchema.parse({
      weights: { mandatory: 100, skills: 0, preferred: 0, title: 0, seniority: 0 },
    });
    expect(computeMatch({ ...base, rubric: titleOnly }).score).toBe(100);
    expect(computeMatch({ ...base, rubric: requirementsOnly }).score).toBe(0);
    expect(() =>
      rubricSchema.parse({ weights: { mandatory: 0, skills: 0, preferred: 0, title: 0, seniority: 0 } }),
    ).toThrow();
  });

  it("leaves out components that do not apply and rescales the rest", () => {
    const empty = jobAnalysisSchema.parse({ jobTitle: "Frontend Engineer", requirements: [] });
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: empty,
      jobTitle: "Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    const byId = Object.fromEntries(result.breakdown.components.map((component) => [component.id, component]));
    expect(byId.mandatory.value).toBeNull();
    expect(byId.skills.value).toBeNull();
    expect(byId.mandatory.points).toBe(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.explanation).toMatch(/no requirements that could be extracted/);
  });

  it("reports restrictions without scoring them", () => {
    const restricted = analysis([
      { description: "Strong TypeScript skills", relatedSkills: ["TypeScript"] },
      { description: "Must hold an EU work permit", category: "restriction" },
    ]);
    const result = computeMatch({
      profile: sampleProfile(),
      analysis: restricted,
      jobTitle: "Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    expect(result.breakdown.restrictions).toEqual(["Must hold an EU work permit"]);
    expect(result.missingQualifications).toEqual([]);
    const mandatory = result.breakdown.components.find((component) => component.id === "mandatory");
    expect(mandatory?.value).toBe(1);
  });
});

describe("experience and seniority", () => {
  it("parses the profile's date formats", () => {
    expect(parseProfileDate("Mar 2021", 0)).toBe(2021 * 12 + 2);
    expect(parseProfileDate("2021-03", 0)).toBe(2021 * 12 + 2);
    expect(parseProfileDate("03/2021", 0)).toBe(2021 * 12 + 2);
    expect(parseProfileDate("2021", 11)).toBe(2021 * 12 + 11);
    expect(parseProfileDate("", 0)).toBeNull();
    expect(parseProfileDate("sometime", 0)).toBeNull();
  });

  it("counts overlapping roles once", () => {
    const profile = sampleProfile();
    const years = experienceYears(profile, NOW);
    // Jun 2017 to Nov 2026 without double counting.
    expect(years).toBeGreaterThan(9);
    expect(years).toBeLessThan(10);
    const doubled = { ...profile, experience: [...profile.experience, { ...profile.experience[0], id: "copy" }] };
    expect(experienceYears(doubled, NOW)).toBe(years);
  });

  it("reads levels and stated years", () => {
    expect(seniorityLevel("Senior Frontend Engineer")).toBe(3);
    expect(seniorityLevel("Staff Engineer")).toBe(4);
    expect(seniorityLevel("Junior Developer")).toBe(1);
    expect(seniorityLevel("Frontend Engineer")).toBeNull();
    expect(statedYears(strongJob)).toBe(5);
    expect(statedYears(weakJob)).toBeNull();
  });

  it("lowers the seniority component when the posting asks for more years than the profile shows", () => {
    const profile = sampleProfile();
    const demanding = analysis([{ description: "15+ years of experience with React", relatedSkills: ["React"] }]);
    const result = computeMatch({
      profile,
      analysis: demanding,
      jobTitle: "Frontend Engineer",
      rubric: DEFAULT_RUBRIC,
      now: NOW,
    });
    const seniority = result.breakdown.components.find((component) => component.id === "seniority");
    expect(seniority?.value).toBeLessThan(0.9);
    expect(seniority?.detail).toMatch(/asks for 15\+ years/);
    expect(result.breakdown.requiredYears).toBe(15);
  });
});
