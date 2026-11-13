import { describe, expect, it } from "vitest";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import {
  checkExportQuality,
  checkHeadline,
  duplicateSkillLabels,
  featuredPlacementIssue,
  headlineIssuesForContent,
  headlineIssuesForProfile,
  parseDate,
  trailingPageIssue,
} from "@/features/resume-rendering/content-checks";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import { groupSkills } from "@/templates/shared";
import { candidateProfile } from "../fixtures/application-cases";

const NOW = new Date("2026-11-13T00:00:00Z");
const content = () => buildBaselineContent(confirmedFactsOnly(candidateProfile()));
const FULL_PAGE = "Lorem ipsum dolor sit amet. ".repeat(120);

describe("headline consistency", () => {
  it('flags the "1+ years" headline above eleven years of roles (regression)', () => {
    const resume = content();
    resume.personal.headline = "Frontend Engineer | 1+ years of experience";
    const issues = headlineIssuesForContent(resume, NOW);
    expect(issues).toEqual(['The headline says "1+ years" but the roles listed span about 11 years (2015 - Present).']);
    const profile = candidateProfile();
    profile.personal.headline = "Frontend Engineer | 1+ years of experience";
    expect(headlineIssuesForProfile(profile, NOW)).toEqual(issues);
  });

  it("accepts the corrected headline and plausible year claims", () => {
    expect(headlineIssuesForContent(content(), NOW)).toEqual([]);
    for (const headline of [
      "Senior Frontend Engineer | 10+ years",
      "Frontend Engineer, 10 years",
      "8+ years in React",
    ]) {
      const resume = content();
      resume.personal.headline = headline;
      expect(headlineIssuesForContent(resume, NOW)).toEqual([]);
    }
  });

  it("flags an overstated claim and a headline that disagrees with the summary", () => {
    const base = {
      roles: [{ title: "Engineer", startDate: "2021", endDate: "2023" }],
      supportingText: "React",
      now: NOW,
    };
    expect(checkHeadline({ ...base, headline: "Engineer with 9 years of experience", summary: "" })).toHaveLength(1);
    expect(
      checkHeadline({
        ...base,
        roles: [{ title: "Engineer", startDate: "2017", endDate: "" }],
        headline: "Engineer | 8+ years",
        summary: "Engineer with 5 years of experience.",
      }),
    ).toEqual(['The headline says "8+ years" while the summary says "5 years".']);
    expect(
      checkHeadline({
        ...base,
        roles: [{ title: "Engineer", startDate: "2015", endDate: "" }],
        headline: "Frontend Engineer, 11 years",
        summary: "Engineer with 10 years of experience.",
      }),
    ).toEqual(['The headline says "11 years" while the summary says "10 years".']);
  });

  it("flags seniority and technology that only the headline claims", () => {
    const resume = content();
    resume.personal.headline = "Junior Kubernetes Developer";
    expect(headlineIssuesForContent(resume, NOW)).toEqual([
      'The headline reads as junior but the most recent title is "Senior Frontend Engineer".',
      'The headline mentions "kubernetes", which does not appear anywhere else in the resume.',
    ]);
  });

  it("parses the date formats the profile accepts", () => {
    expect(parseDate("Mar 2021")).toBeCloseTo(2021 + 2 / 12);
    expect(parseDate("2021-03")).toBeCloseTo(2021 + 2 / 12);
    expect(parseDate("03/2021")).toBeCloseTo(2021 + 2 / 12);
    expect(parseDate("2021")).toBe(2021);
    expect(parseDate("Present")).toBeNull();
  });
});

describe("duplicate skill labels", () => {
  it("reports a skill listed twice and a repeated section heading", () => {
    const resume = content();
    resume.skills.push({ id: "skill_react_2", name: "react", category: "Libraries" });
    resume.additionalSections = [
      {
        id: "sec_lang",
        status: "confirmed",
        kind: "other",
        title: "Languages",
        items: [{ id: "i1", title: "English", description: "", date: "", url: "" }],
      },
      {
        id: "sec_skills",
        status: "confirmed",
        kind: "other",
        title: "Technical Skills",
        items: [{ id: "i2", title: "React", description: "", date: "", url: "" }],
      },
    ];
    expect(duplicateSkillLabels(resume)).toEqual([
      'The skill "React" is listed 2 times (under Frontend and Libraries).',
      'The section heading "Languages" appears twice (it repeats the Languages section).',
      'The section heading "Technical Skills" appears twice (it repeats the Skills section).',
    ]);
    expect(duplicateSkillLabels(content())).toEqual([]);
  });

  it("prints one row for category labels that differ only in case or spacing", () => {
    const resume = content();
    resume.skills = [
      { id: "a", name: "React", category: "Frontend" },
      { id: "b", name: "Jest", category: "Testing" },
      { id: "c", name: "CSS", category: "frontend " },
    ];
    expect(groupSkills(resume)).toEqual([
      { category: "Frontend", skills: ["React", "CSS"] },
      { category: "Testing", skills: ["Jest"] },
    ]);
  });
});

describe("page-level checks", () => {
  it("flags a last page that holds only a few skills or language lines", () => {
    const issue = trailingPageIssue(
      [
        FULL_PAGE,
        FULL_PAGE,
        "Practices Accessibility, Web performance LANGUAGES English (Fluent) · Dutch (Professional)",
      ],
      content(),
    );
    expect(issue).toBe(
      "The PDF ends on page 3 with only about 1 line (Languages). Shorten or reorder content so it does not spill onto a nearly empty page.",
    );
  });

  it("accepts a single page and a reasonably filled last page", () => {
    expect(trailingPageIssue([FULL_PAGE], content())).toBeNull();
    expect(trailingPageIssue([FULL_PAGE, FULL_PAGE.slice(0, 1200)], content())).toBeNull();
    expect(trailingPageIssue([FULL_PAGE, "  "], content())).toBe("Page 2 of the PDF is blank.");
  });

  it("checks that the selected project is on page one", () => {
    const resume = content();
    resume.featured = {
      entryId: "exp_ledgerline",
      entryKind: "experience",
      title: "Fraud-detection portal",
      subtitle: "Frontend Engineer, Ledgerline",
      startDate: "Feb 2018",
      endDate: "Dec 2019",
      description: "",
      technologies: [],
      bullets: [
        { id: "b1", text: "Built the fraud-detection portal that analysts use.", sourceIds: [], kind: "original" },
      ],
    };
    const first = `Rowan Castell Selected Project Built the fraud-detection  portal\nthat analysts use. ${FULL_PAGE}`;
    expect(featuredPlacementIssue([first, FULL_PAGE], resume)).toBeNull();
    expect(featuredPlacementIssue([FULL_PAGE, first], resume)).toMatch(/is not on the first page/);
    expect(checkExportQuality(resume, [FULL_PAGE, first], NOW).map((warning) => warning.code)).toEqual([
      "featured_not_on_first_page",
    ]);
  });
});
