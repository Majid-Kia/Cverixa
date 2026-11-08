import { newId } from "@/lib/ids";
import type { ProfileImportAiOutput } from "@/server/ai/schemas/profile-import";
import { careerProfileDataSchema, type CareerProfileData } from "./schema";

/**
 * Convert validated AI import output into a Master Career Profile draft. Every
 * entry receives a stable id and the "imported" status; nothing becomes
 * canonical until the owner reviews and confirms it (PRD FR-001).
 */
export function normalizeImportedProfile(output: ProfileImportAiOutput): CareerProfileData {
  const status = "imported" as const;
  const draft = {
    personal: {
      ...output.personal,
      links: output.personal.links
        .filter((link) => link.url.trim())
        .map((link) => ({ id: newId("link"), label: link.label || link.url, url: link.url })),
    },
    summary: output.summary,
    experience: output.experience
      .filter((entry) => entry.employer.trim() || entry.title.trim())
      .map((entry) => ({
        id: newId("exp"),
        status,
        employer: entry.employer || "Unknown employer",
        title: entry.title || "Unknown title",
        location: entry.location,
        employmentType: entry.employmentType,
        startDate: entry.startDate || "Unknown",
        endDate: /^(present|current|now)$/i.test(entry.endDate.trim()) ? "" : entry.endDate,
        responsibilities: entry.responsibilities.filter(Boolean).map((text) => ({ id: newId("stmt"), text })),
        achievements: entry.achievements.filter(Boolean).map((text) => ({ id: newId("ach"), text, metrics: [] })),
        technologies: dedupe(entry.technologies),
        sourceReference: "",
      })),
    skills: dedupeBy(output.skills, (skill) => skill.name.toLowerCase())
      .filter((skill) => skill.name.trim())
      .map((skill) => ({
        id: newId("skill"),
        status,
        name: skill.name,
        category: skill.category || "General",
        proficiency: skill.proficiency,
        evidenceRefs: [],
      })),
    projects: output.projects
      .filter((project) => project.name.trim())
      .map((project) => ({
        id: newId("proj"),
        status,
        name: project.name,
        description: project.description,
        role: project.role,
        technologies: dedupe(project.technologies),
        outcomes: project.outcomes.filter(Boolean).map((text) => ({ id: newId("out"), text })),
        url: project.url,
        repositoryUrl: project.repositoryUrl,
      })),
    education: output.education
      .filter((entry) => entry.institution.trim())
      .map((entry) => ({ id: newId("edu"), status, ...entry })),
    certifications: output.certifications
      .filter((entry) => entry.name.trim())
      .map((entry) => ({ id: newId("cert"), status, ...entry })),
    languages: output.languages
      .filter((entry) => entry.language.trim())
      .map((entry) => ({ id: newId("lang"), status, ...entry })),
    additionalSections: output.additionalSections
      .filter((section) => section.title.trim())
      .map((section) => ({
        id: newId("sec"),
        status,
        kind: section.kind,
        title: section.title,
        items: section.items.filter((item) => item.title.trim()).map((item) => ({ id: newId("item"), ...item })),
      })),
  };
  return careerProfileDataSchema.parse(draft);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const k = key(value);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
