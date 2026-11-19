import { newId } from "@/lib/ids";
import type { AdditionalItem, AdditionalSection, CertificationEntry, EducationEntry } from "./schema";

/**
 * Entries the owner typed in themselves outside the profile editor (for
 * example in Review Mode). The same entries, with the same ids, can be placed
 * on a resume and on the Master Career Profile.
 */
export interface OwnerAdditions {
  certifications: CertificationEntry[];
  education: EducationEntry[];
  /** One-line statements, kept in an "Additional information" section. */
  statements: AdditionalItem[];
}

export const OWNER_STATEMENTS_TITLE = "Additional information";

interface AdditionsTarget {
  certifications: CertificationEntry[];
  education: EducationEntry[];
  additionalSections: AdditionalSection[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function hasOwnerAdditions(additions: OwnerAdditions): boolean {
  return additions.certifications.length + additions.education.length + additions.statements.length > 0;
}

/**
 * Append the entries to a profile or resume content, returning a new object.
 * An entry that is already there under the same name is not repeated; if that
 * existing entry was still unconfirmed, the owner entering it confirms it.
 */
export function addOwnerAdditions<T extends AdditionsTarget>(target: T, additions: OwnerAdditions): T {
  const certifications = target.certifications.map((entry) => ({ ...entry }));
  for (const entry of additions.certifications) {
    const existing = certifications.find((candidate) => same(candidate.name, entry.name));
    if (existing) existing.status = "confirmed";
    else certifications.push(entry);
  }
  const education = target.education.map((entry) => ({ ...entry }));
  for (const entry of additions.education) {
    const existing = education.find(
      (candidate) => same(candidate.degree, entry.degree) && same(candidate.institution, entry.institution),
    );
    if (existing) existing.status = "confirmed";
    else education.push(entry);
  }
  let additionalSections = target.additionalSections;
  if (additions.statements.length > 0) {
    additionalSections = target.additionalSections.map((section) => ({ ...section, items: [...section.items] }));
    let section = additionalSections.find(
      (candidate) =>
        candidate.kind === "other" && candidate.status === "confirmed" && same(candidate.title, OWNER_STATEMENTS_TITLE),
    );
    if (!section) {
      section = { id: newId("sec"), status: "confirmed", kind: "other", title: OWNER_STATEMENTS_TITLE, items: [] };
      additionalSections.push(section);
    }
    for (const item of additions.statements) {
      if (!section.items.some((candidate) => same(candidate.title, item.title))) section.items.push(item);
    }
  }
  return { ...target, certifications, education, additionalSections };
}
