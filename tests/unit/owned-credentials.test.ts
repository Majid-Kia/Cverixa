import { describe, expect, it } from "vitest";
import { addOwnerAdditions, hasOwnerAdditions } from "@/features/career-profile/additions";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { buildBaselineContent } from "@/features/resume-tailoring/build-content";
import {
  applyOwnedCredentials,
  describeOwnedCredential,
  ownedCredentialSchema,
  ownedCredentialsInputSchema,
  suggestCredentialKind,
  toOwnerAdditions,
} from "@/features/resume-tailoring/owned-credentials";
import { resumeContentSchema } from "@/types/resume-content";
import { sampleProfile } from "../fixtures/profiles";

const LISTED = ["Certified Kubernetes Administrator", "PhD in astrophysics", "Must hold a Canadian passport"];

const cert = {
  kind: "certification" as const,
  requirement: LISTED[0],
  name: "  Certified Kubernetes\n Administrator ",
  issuer: "CNCF",
  date: "2024",
};
const degree = {
  kind: "education" as const,
  requirement: LISTED[1],
  degree: "PhD",
  fieldOfStudy: "Astrophysics",
  institution: "Leiden University",
  endDate: "2016",
};
const passport = { kind: "statement" as const, requirement: LISTED[2], text: "Canadian citizen" };

describe("credentials the owner enters in Review Mode", () => {
  it("accepts only complete entries and keeps the owner's wording", () => {
    const parsed = ownedCredentialsInputSchema.parse({ items: [cert, degree, passport], saveToProfile: true });
    expect(parsed.items[0]).toEqual({ ...cert, name: "Certified Kubernetes Administrator" });
    expect(parsed.items.map(describeOwnedCredential)).toEqual([
      "Certified Kubernetes Administrator, CNCF, 2024",
      "PhD in Astrophysics, Leiden University, 2016",
      "Canadian citizen",
    ]);
    expect(ownedCredentialsInputSchema.parse({})).toEqual({ items: [], saveToProfile: false });

    expect(ownedCredentialSchema.safeParse({ ...cert, name: "   " }).success).toBe(false);
    expect(ownedCredentialSchema.safeParse({ ...degree, institution: "" }).success).toBe(false);
    expect(ownedCredentialSchema.safeParse({ ...passport, text: "x".repeat(301) }).success).toBe(false);
    expect(ownedCredentialSchema.safeParse({ ...passport, kind: "visa" }).success).toBe(false);
  });

  it("opens the matching form for a requirement without filling anything in", () => {
    expect(suggestCredentialKind("AWS Certified Developer")).toBe("certification");
    expect(suggestCredentialKind("Bachelor's degree in Computer Science")).toBe("education");
    expect(suggestCredentialKind("Must have the right to work in the UK")).toBe("statement");
    expect(suggestCredentialKind("Active security clearance")).toBe("statement");
  });

  it("takes one entry per listed requirement and ignores anything else", () => {
    const items = ownedCredentialsInputSchema.parse({
      items: [
        cert,
        { ...cert, name: "A second answer to the same requirement" },
        { ...degree, requirement: "A requirement this review never listed" },
        passport,
      ],
    }).items;
    const { additions, accepted } = toOwnerAdditions(items, LISTED);
    expect(accepted.map((item) => item.requirement)).toEqual([LISTED[0], LISTED[2]]);
    expect(additions.certifications).toEqual([
      expect.objectContaining({
        status: "confirmed",
        name: "Certified Kubernetes Administrator",
        issuer: "CNCF",
        date: "2024",
      }),
    ]);
    expect(additions.education).toEqual([]);
    expect(additions.statements).toEqual([expect.objectContaining({ title: "Canadian citizen" })]);
    expect(hasOwnerAdditions(additions)).toBe(true);
    expect(hasOwnerAdditions(toOwnerAdditions(items, []).additions)).toBe(false);
  });

  it("places the entries in their resume sections, shown, without repeating one that is already there", () => {
    const profile = confirmedFactsOnly(sampleProfile());
    const baseline = buildBaselineContent(profile);
    const content = { ...baseline, hiddenSections: ["certifications" as const, "languages" as const] };
    const items = ownedCredentialsInputSchema.parse({ items: [cert, degree, passport] }).items;
    const { additions } = toOwnerAdditions(items, LISTED);

    const result = applyOwnedCredentials(content, additions);
    expect(result.certifications.map((entry) => entry.name)).toEqual([
      ...baseline.certifications.map((entry) => entry.name),
      "Certified Kubernetes Administrator",
    ]);
    expect(result.education.at(-1)).toEqual(
      expect.objectContaining({ degree: "PhD", fieldOfStudy: "Astrophysics", institution: "Leiden University" }),
    );
    const section = result.additionalSections.find((entry) => entry.title === "Additional information");
    expect(section?.items.map((item) => item.title)).toEqual(["Canadian citizen"]);
    // A section the owner just added to is shown; other hidden sections stay hidden.
    expect(result.hiddenSections).toEqual(["languages"]);
    expect(resumeContentSchema.safeParse(result).success).toBe(true);
    // The input is not mutated, and nothing else on the resume changes.
    expect(content.certifications).toEqual(baseline.certifications);
    expect(result.experience).toBe(content.experience);
    expect(result.skills).toBe(content.skills);

    const again = applyOwnedCredentials(result, additions);
    expect(again.certifications).toHaveLength(result.certifications.length);
    expect(again.education).toHaveLength(result.education.length);
    expect(again.additionalSections.find((entry) => entry.title === "Additional information")?.items).toHaveLength(1);
    expect(applyOwnedCredentials(content, { certifications: [], education: [], statements: [] })).toBe(content);
  });

  it("confirms an unconfirmed profile entry the owner enters again instead of duplicating it", () => {
    const profile = sampleProfile();
    profile.certifications = [
      {
        id: "cert_old",
        status: "imported",
        name: "certified kubernetes administrator",
        issuer: "",
        date: "",
        credentialUrl: "",
      },
    ];
    const { additions } = toOwnerAdditions(ownedCredentialsInputSchema.parse({ items: [cert] }).items, LISTED);
    const next = addOwnerAdditions(profile, additions);
    expect(next.certifications).toEqual([expect.objectContaining({ id: "cert_old", status: "confirmed" })]);
    expect(profile.certifications[0].status).toBe("imported");
  });
});
