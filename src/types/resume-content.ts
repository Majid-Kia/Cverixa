import { z } from "zod";
import {
  additionalSectionSchema,
  certificationSchema,
  educationSchema,
  languageSchema,
  personalInfoSchema,
} from "@/features/career-profile/schema";

export const RESUME_CONTENT_SCHEMA_VERSION = 1;

/**
 * Normalized resume content consumed by every template. Templates render this
 * structure and never mutate it (PRD 5.3, 11.1).
 */

export const resumeBulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(1000),
  /** Ids of confirmed profile statements/achievements this bullet is derived from. */
  sourceIds: z.array(z.string()).default([]),
  /** How the bullet relates to its sources. */
  kind: z.enum(["original", "reworded", "composed"]).default("original"),
});
export type ResumeBullet = z.infer<typeof resumeBulletSchema>;

export const resumeExperienceSchema = z.object({
  /** Id of the confirmed profile experience entry. */
  id: z.string().min(1),
  employer: z.string().trim().max(200),
  title: z.string().trim().max(200),
  location: z.string().trim().max(200).default(""),
  startDate: z.string().trim().max(40),
  endDate: z.string().trim().max(40).default(""),
  bullets: z.array(resumeBulletSchema).default([]),
  technologies: z.array(z.string().trim().max(100)).default([]),
});
export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;

export const resumeProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(200),
  role: z.string().trim().max(200).default(""),
  description: z.string().trim().max(2000).default(""),
  technologies: z.array(z.string().trim().max(100)).default([]),
  bullets: z.array(resumeBulletSchema).default([]),
  url: z.string().trim().max(500).default(""),
  repositoryUrl: z.string().trim().max(500).default(""),
});
export type ResumeProject = z.infer<typeof resumeProjectSchema>;

export const resumeSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(100),
  category: z.string().trim().max(100).default("General"),
});
export type ResumeSkill = z.infer<typeof resumeSkillSchema>;

export const resumeSectionKeySchema = z.enum([
  "summary",
  "experience",
  "skills",
  "projects",
  "education",
  "certifications",
  "languages",
  "additional",
]);
export type ResumeSectionKey = z.infer<typeof resumeSectionKeySchema>;

export const DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "experience",
  "skills",
  "projects",
  "education",
  "certifications",
  "languages",
  "additional",
];

export const resumeContentSchema = z.object({
  schemaVersion: z.literal(RESUME_CONTENT_SCHEMA_VERSION).default(RESUME_CONTENT_SCHEMA_VERSION),
  personal: personalInfoSchema,
  summary: z.object({
    text: z.string().trim().max(2000).default(""),
    sourceIds: z.array(z.string()).default([]),
  }),
  sectionOrder: z.array(resumeSectionKeySchema).default(DEFAULT_SECTION_ORDER),
  hiddenSections: z.array(resumeSectionKeySchema).default([]),
  experience: z.array(resumeExperienceSchema).default([]),
  skills: z.array(resumeSkillSchema).default([]),
  projects: z.array(resumeProjectSchema).default([]),
  education: z.array(educationSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  languages: z.array(languageSchema).default([]),
  additionalSections: z.array(additionalSectionSchema).default([]),
});
export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const pageFormatSchema = z.enum(["A4", "Letter"]);
export type PageFormat = z.infer<typeof pageFormatSchema>;

export const SECTION_LABELS: Record<ResumeSectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  languages: "Languages",
  additional: "Additional",
};

/** Sections in render order, excluding hidden and empty ones. */
export function visibleSections(content: ResumeContent): ResumeSectionKey[] {
  const order = [...content.sectionOrder];
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!order.includes(key)) order.push(key);
  }
  return order.filter((key) => !content.hiddenSections.includes(key) && sectionHasContent(content, key));
}

export function sectionHasContent(content: ResumeContent, key: ResumeSectionKey): boolean {
  switch (key) {
    case "summary":
      return content.summary.text.trim().length > 0;
    case "experience":
      return content.experience.length > 0;
    case "skills":
      return content.skills.length > 0;
    case "projects":
      return content.projects.length > 0;
    case "education":
      return content.education.length > 0;
    case "certifications":
      return content.certifications.length > 0;
    case "languages":
      return content.languages.length > 0;
    case "additional":
      return content.additionalSections.some((section) => section.items.length > 0);
  }
}
