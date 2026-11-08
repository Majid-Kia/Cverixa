import { z } from "zod";

/**
 * Shape requested from the AI when converting extracted resume text into
 * structured data. Ids are intentionally absent; the application assigns them
 * and marks every entry as "imported" until the owner confirms.
 */
const str = z.string().default("");
const strList = z.array(z.string()).default([]);

export const profileImportAiOutputSchema = z.object({
  personal: z
    .object({
      fullName: str,
      headline: str,
      email: str,
      phone: str,
      location: str,
      linkedinUrl: str,
      githubUrl: str,
      portfolioUrl: str,
      links: z.array(z.object({ label: str, url: str })).default([]),
    })
    .default({
      fullName: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      linkedinUrl: "",
      githubUrl: "",
      portfolioUrl: "",
      links: [],
    }),
  summary: z
    .object({ text: str, keyStrengths: strList, specializations: strList, highlights: strList })
    .default({ text: "", keyStrengths: [], specializations: [], highlights: [] }),
  experience: z
    .array(
      z.object({
        employer: str,
        title: str,
        location: str,
        employmentType: str,
        startDate: str,
        endDate: str,
        responsibilities: strList,
        achievements: strList,
        technologies: strList,
      }),
    )
    .default([]),
  skills: z.array(z.object({ name: z.string(), category: str, proficiency: str })).default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: str,
        role: str,
        technologies: strList,
        outcomes: strList,
        url: str,
        repositoryUrl: str,
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: str,
        fieldOfStudy: str,
        startDate: str,
        endDate: str,
        details: strList,
      }),
    )
    .default([]),
  certifications: z.array(z.object({ name: z.string(), issuer: str, date: str, credentialUrl: str })).default([]),
  languages: z.array(z.object({ language: z.string(), proficiency: str })).default([]),
  additionalSections: z
    .array(
      z.object({
        kind: z.enum(["publications", "awards", "volunteer", "open_source", "other"]).default("other"),
        title: z.string(),
        items: z.array(z.object({ title: z.string(), description: str, date: str, url: str })).default([]),
      }),
    )
    .default([]),
  /** Uncertain, ambiguous or unrecognised information the user should review. */
  warnings: strList,
});
export type ProfileImportAiOutput = z.infer<typeof profileImportAiOutputSchema>;
