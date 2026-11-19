import { z } from "zod";
import { addOwnerAdditions, type OwnerAdditions } from "@/features/career-profile/additions";
import { newId } from "@/lib/ids";
import type { ResumeContent, ResumeSectionKey } from "@/types/resume-content";

/**
 * Degrees, certifications, licences and eligibility that the owner states
 * they hold, entered in Review Mode against a requirement the profile does not
 * show. The application never writes these: it only places what the owner
 * typed, word for word, in the matching resume section.
 */
const line = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));
const required = (max: number) => line(max).pipe(z.string().min(1));
const requirement = z.string().trim().min(1).max(500);

export const ownedCredentialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("certification"),
    requirement,
    name: required(200),
    issuer: line(200).default(""),
    date: line(40).default(""),
  }),
  z.object({
    kind: z.literal("education"),
    requirement,
    degree: required(200),
    fieldOfStudy: line(200).default(""),
    institution: required(200),
    endDate: line(40).default(""),
  }),
  z.object({
    kind: z.literal("statement"),
    requirement,
    text: required(300),
  }),
]);
export type OwnedCredential = z.infer<typeof ownedCredentialSchema>;
export type OwnedCredentialKind = OwnedCredential["kind"];

export const ownedCredentialsInputSchema = z.object({
  items: z.array(ownedCredentialSchema).max(20).default([]),
  /** Also store the entries on the Master Career Profile. */
  saveToProfile: z.boolean().default(false),
});

const DEGREE = /\b(degree|bachelor'?s?|master'?s|b\.?sc|m\.?sc|mba|ph\.?d|doctorate|diploma|graduate)\b/i;
const ELIGIBILITY =
  /\b(clearance|visa|citizen\w*|passport|work (permit|authori[sz]ation)|right to work|eligib\w+ to work|sponsor\w*)\b/i;

/** Which form to open first for a requirement. The owner can change it; nothing is pre-filled. */
export function suggestCredentialKind(requirementText: string): OwnedCredentialKind {
  if (ELIGIBILITY.test(requirementText)) return "statement";
  if (DEGREE.test(requirementText)) return "education";
  return "certification";
}

/** How an entry reads on one line, e.g. "AWS Certified Developer, Amazon Web Services, 2023". */
export function describeOwnedCredential(item: OwnedCredential): string {
  if (item.kind === "certification") return [item.name, item.issuer, item.date].filter(Boolean).join(", ");
  if (item.kind === "education") {
    const degree = [item.degree, item.fieldOfStudy].filter(Boolean).join(" in ");
    return [degree, item.institution, item.endDate].filter(Boolean).join(", ");
  }
  return item.text;
}

/**
 * Turn what the owner entered into resume/profile entries. Only requirements
 * listed for this review are accepted, one entry each.
 */
export function toOwnerAdditions(
  items: OwnedCredential[],
  listedRequirements: string[],
): { additions: OwnerAdditions; accepted: OwnedCredential[] } {
  const additions: OwnerAdditions = { certifications: [], education: [], statements: [] };
  const accepted: OwnedCredential[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!listedRequirements.includes(item.requirement) || seen.has(item.requirement)) continue;
    seen.add(item.requirement);
    accepted.push(item);
    if (item.kind === "certification") {
      additions.certifications.push({
        id: newId("cert"),
        status: "confirmed",
        name: item.name,
        issuer: item.issuer,
        date: item.date,
        credentialUrl: "",
      });
    } else if (item.kind === "education") {
      additions.education.push({
        id: newId("edu"),
        status: "confirmed",
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        startDate: "",
        endDate: item.endDate,
        details: [],
      });
    } else {
      additions.statements.push({ id: newId("item"), title: item.text, description: "", date: "", url: "" });
    }
  }
  return { additions, accepted };
}

/** Place the owner's entries on the resume and make sure their sections are shown. */
export function applyOwnedCredentials(content: ResumeContent, additions: OwnerAdditions): ResumeContent {
  const touched: ResumeSectionKey[] = [];
  if (additions.certifications.length > 0) touched.push("certifications");
  if (additions.education.length > 0) touched.push("education");
  if (additions.statements.length > 0) touched.push("additional");
  if (touched.length === 0) return content;
  const result = addOwnerAdditions(content, additions);
  return { ...result, hiddenSections: result.hiddenSections.filter((key) => !touched.includes(key)) };
}
