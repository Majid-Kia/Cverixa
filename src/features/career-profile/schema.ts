import { z } from "zod";

export const PROFILE_SCHEMA_VERSION = 1;

/**
 * Provenance of a fact. Only `confirmed` facts are eligible as evidence for
 * AI tailoring (PRD 7.2).
 */
export const factStatusSchema = z.enum(["confirmed", "imported", "ai_suggested"]);
export type FactStatus = z.infer<typeof factStatusSchema>;

const trimmed = z.string().trim();
const optionalText = trimmed.max(2000).optional().default("");
const urlish = trimmed.max(500).optional().default("");

/** Dates are stored as free text validated loosely: "2021-03", "2021", "Mar 2021". */
export const dateTextSchema = trimmed.max(40);

export const linkSchema = z.object({
  id: trimmed.min(1),
  label: trimmed.max(100),
  url: trimmed.max(500),
});

export const personalInfoSchema = z.object({
  fullName: trimmed.max(200),
  headline: optionalText,
  email: trimmed.max(200).optional().default(""),
  phone: trimmed.max(60).optional().default(""),
  location: trimmed.max(200).optional().default(""),
  linkedinUrl: urlish,
  githubUrl: urlish,
  portfolioUrl: urlish,
  links: z.array(linkSchema).default([]),
});

export const summarySchema = z.object({
  text: optionalText,
  keyStrengths: z.array(trimmed.max(200)).default([]),
  specializations: z.array(trimmed.max(200)).default([]),
  highlights: z.array(trimmed.max(500)).default([]),
});

export const statementSchema = z.object({
  id: trimmed.min(1),
  text: trimmed.max(1000),
});

export const metricSchema = z.object({
  id: trimmed.min(1),
  label: trimmed.max(200),
  value: trimmed.max(100),
});

export const achievementSchema = z.object({
  id: trimmed.min(1),
  text: trimmed.max(1000),
  metrics: z.array(metricSchema).default([]),
});

export const experienceSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  employer: trimmed.max(200),
  title: trimmed.max(200),
  location: trimmed.max(200).optional().default(""),
  employmentType: trimmed.max(60).optional().default(""),
  startDate: dateTextSchema,
  /** Empty string means "Present". */
  endDate: dateTextSchema.optional().default(""),
  responsibilities: z.array(statementSchema).default([]),
  achievements: z.array(achievementSchema).default([]),
  technologies: z.array(trimmed.max(100)).default([]),
  sourceReference: trimmed.max(500).optional().default(""),
});

export const skillSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  name: trimmed.max(100),
  category: trimmed.max(100).optional().default("General"),
  proficiency: trimmed.max(60).optional().default(""),
  evidenceRefs: z.array(trimmed).default([]),
});

export const projectSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  name: trimmed.max(200),
  description: trimmed.max(2000).optional().default(""),
  role: trimmed.max(200).optional().default(""),
  technologies: z.array(trimmed.max(100)).default([]),
  outcomes: z.array(statementSchema).default([]),
  url: urlish,
  repositoryUrl: urlish,
});

export const educationSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  institution: trimmed.max(200),
  degree: trimmed.max(200).optional().default(""),
  fieldOfStudy: trimmed.max(200).optional().default(""),
  startDate: dateTextSchema.optional().default(""),
  endDate: dateTextSchema.optional().default(""),
  details: z.array(trimmed.max(500)).default([]),
});

export const certificationSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  name: trimmed.max(200),
  issuer: trimmed.max(200).optional().default(""),
  date: dateTextSchema.optional().default(""),
  credentialUrl: urlish,
});

export const languageSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  language: trimmed.max(100),
  proficiency: trimmed.max(100).optional().default(""),
});

export const additionalSectionKindSchema = z.enum(["publications", "awards", "volunteer", "open_source", "other"]);

export const additionalItemSchema = z.object({
  id: trimmed.min(1),
  title: trimmed.max(300),
  description: trimmed.max(1000).optional().default(""),
  date: dateTextSchema.optional().default(""),
  url: urlish,
});

export const additionalSectionSchema = z.object({
  id: trimmed.min(1),
  status: factStatusSchema.default("confirmed"),
  kind: additionalSectionKindSchema.default("other"),
  title: trimmed.max(100),
  items: z.array(additionalItemSchema).default([]),
});

/** The Master Career Profile: canonical, structured, user-owned data. */
export const careerProfileDataSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
  personal: personalInfoSchema,
  summary: summarySchema.default({ text: "", keyStrengths: [], specializations: [], highlights: [] }),
  experience: z.array(experienceSchema).default([]),
  skills: z.array(skillSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  languages: z.array(languageSchema).default([]),
  additionalSections: z.array(additionalSectionSchema).default([]),
});

export type CareerProfileData = z.infer<typeof careerProfileDataSchema>;
export type PersonalInfo = z.infer<typeof personalInfoSchema>;
export type ProfileSummary = z.infer<typeof summarySchema>;
export type ExperienceEntry = z.infer<typeof experienceSchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type Statement = z.infer<typeof statementSchema>;
export type SkillEntry = z.infer<typeof skillSchema>;
export type ProjectEntry = z.infer<typeof projectSchema>;
export type EducationEntry = z.infer<typeof educationSchema>;
export type CertificationEntry = z.infer<typeof certificationSchema>;
export type LanguageEntry = z.infer<typeof languageSchema>;
export type AdditionalSection = z.infer<typeof additionalSectionSchema>;
export type AdditionalItem = z.infer<typeof additionalItemSchema>;

export function emptyProfile(fullName = ""): CareerProfileData {
  return careerProfileDataSchema.parse({ personal: { fullName } });
}

/** Return a copy of the profile containing only user-confirmed entries. */
export function confirmedFactsOnly(profile: CareerProfileData): CareerProfileData {
  const keep = <T extends { status: FactStatus }>(items: T[]) => items.filter((item) => item.status === "confirmed");
  return {
    ...profile,
    experience: keep(profile.experience),
    skills: keep(profile.skills),
    projects: keep(profile.projects),
    education: keep(profile.education),
    certifications: keep(profile.certifications),
    languages: keep(profile.languages),
    additionalSections: keep(profile.additionalSections),
  };
}

/** Mark every entry as confirmed (used when the owner confirms an import). */
export function markAllConfirmed(profile: CareerProfileData): CareerProfileData {
  const confirm = <T extends { status: FactStatus }>(items: T[]) =>
    items.map((item) => ({ ...item, status: "confirmed" as const }));
  return {
    ...profile,
    experience: confirm(profile.experience),
    skills: confirm(profile.skills),
    projects: confirm(profile.projects),
    education: confirm(profile.education),
    certifications: confirm(profile.certifications),
    languages: confirm(profile.languages),
    additionalSections: confirm(profile.additionalSections),
  };
}

export function countProfileEntries(profile: CareerProfileData) {
  const all = [
    ...profile.experience,
    ...profile.skills,
    ...profile.projects,
    ...profile.education,
    ...profile.certifications,
    ...profile.languages,
    ...profile.additionalSections,
  ];
  return {
    experience: profile.experience.length,
    skills: profile.skills.length,
    projects: profile.projects.length,
    education: profile.education.length,
    certifications: profile.certifications.length,
    languages: profile.languages.length,
    total: all.length,
    unconfirmed: all.filter((item) => item.status !== "confirmed").length,
  };
}
