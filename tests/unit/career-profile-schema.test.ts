import { describe, expect, it } from "vitest";
import { normalizeImportedProfile } from "@/features/career-profile/normalize";
import {
  careerProfileDataSchema,
  confirmedFactsOnly,
  countProfileEntries,
  emptyProfile,
  markAllConfirmed,
} from "@/features/career-profile/schema";
import { profileImportAiOutputSchema } from "@/server/ai/schemas/profile-import";
import { resumeContentSchema, sectionHasContent, visibleSections } from "@/types/resume-content";
import { sampleProfile } from "../fixtures/profiles";

describe("career profile schema", () => {
  it("creates an empty profile with defaults", () => {
    const profile = emptyProfile("Jane");
    expect(profile.personal.fullName).toBe("Jane");
    expect(profile.experience).toEqual([]);
    expect(profile.schemaVersion).toBe(1);
  });

  it("rejects entries without stable identifiers", () => {
    const result = careerProfileDataSchema.safeParse({ personal: { fullName: "X" }, skills: [{ name: "React" }] });
    expect(result.success).toBe(false);
  });

  it("filters to confirmed facts only", () => {
    const confirmed = confirmedFactsOnly(sampleProfile());
    expect(confirmed.skills.some((skill) => skill.name === "Kubernetes")).toBe(false);
    expect(confirmed.skills.length).toBe(6);
  });

  it("marks all entries confirmed", () => {
    const confirmed = markAllConfirmed(sampleProfile());
    expect(countProfileEntries(confirmed).unconfirmed).toBe(0);
  });

  it("normalises AI import output with ids and imported status", () => {
    const output = profileImportAiOutputSchema.parse({
      personal: { fullName: "Imported Person", email: "a@b.com" },
      experience: [
        {
          employer: "Co",
          title: "Dev",
          startDate: "2020",
          endDate: "Present",
          responsibilities: ["Did X"],
          achievements: ["Grew Y by 10%"],
          technologies: ["React", "react"],
        },
      ],
      skills: [{ name: "React" }, { name: "react" }],
      warnings: ["Check dates"],
    });
    const profile = normalizeImportedProfile(output);
    expect(profile.experience[0].status).toBe("imported");
    expect(profile.experience[0].endDate).toBe("");
    expect(profile.experience[0].id).toMatch(/^exp_/);
    expect(profile.experience[0].achievements[0].id).toMatch(/^ach_/);
    expect(profile.experience[0].technologies).toEqual(["React"]);
    expect(profile.skills.length).toBe(1);
    expect(countProfileEntries(profile).unconfirmed).toBeGreaterThan(0);
  });
});

describe("resume content schema", () => {
  it("applies defaults and hides empty sections", () => {
    const content = resumeContentSchema.parse({ personal: { fullName: "A" }, summary: { text: "" } });
    expect(content.sectionOrder.length).toBe(8);
    expect(sectionHasContent(content, "summary")).toBe(false);
    expect(visibleSections(content)).toEqual([]);
  });

  it("respects hidden sections and custom order", () => {
    const content = resumeContentSchema.parse({
      personal: { fullName: "A" },
      summary: { text: "Hello" },
      sectionOrder: ["skills", "summary"],
      hiddenSections: ["skills"],
      skills: [{ id: "s", name: "React" }],
    });
    expect(visibleSections(content)).toEqual(["summary"]);
  });
});
