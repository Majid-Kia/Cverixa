import type { CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm } from "@/features/job-analysis/keywords";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import { newId } from "@/lib/ids";
import type { ResumeBullet, ResumeContent } from "@/types/resume-content";
import type { EvidenceMap, SuppliedContent, TailoringAiOutput } from "./schema";

/**
 * Covering job requirements the profile has no evidence for.
 *
 * This is the one deliberate exception to "every claim cites a confirmed
 * fact". The owner asks for it per generation, and everything it adds is kept
 * apart from validated content: skills carry `supplied: true`, bullets have
 * kind `supplied` and no source, Review Mode offers each addition as its own
 * proposal, and the change report lists them as unverified. Degrees,
 * certifications and eligibility are never supplied.
 */
export interface Gap {
  requirementId: string;
  description: string;
  /** `skill`: add the named skills. `experience`: add or swap in one bullet. */
  kind: "skill" | "experience";
  /** Skill names taken from the posting (empty for experience gaps). */
  skills: string[];
  /** What the profile does not show for this requirement (empty when it shows nothing at all). */
  missing: string;
  /** Role that already holds related evidence, if any; the bullet goes there by default. */
  entryId: string;
}

const SKILL_CATEGORIES = new Set(["technical_skill", "preferred_skill"]);
const MAX_SUPPLIED_SKILLS = 20;
const MAX_SUPPLIED_BULLETS = 8;
const MAX_SWAPS_PER_ROLE = 2;
const OTHER_CATEGORY = "Other";

/**
 * Credentials and personal circumstances: degrees, certifications, licences,
 * clearances, visas, citizenship. An employer verifies these, so the
 * application never writes them for the owner; it lists them to be added to
 * the Master Career Profile if they are true.
 */
const CREDENTIAL =
  /\b(degree|bachelor'?s?|master'?s|b\.?sc|m\.?sc|b\.?a|b\.?s|m\.?a|mba|ph\.?d|doctorate|diploma|graduate|certif\w+|accredit\w+|licen[cs]\w*|chartered|clearance|visa|citizen\w*|passport|work (permit|authori[sz]ation)|right to work|eligib\w+ to work|sponsor\w*)\b/i;

function isCredential(requirement: JobAnalysis["requirements"][number]): boolean {
  return requirement.category === "restriction" || CREDENTIAL.test(requirement.description);
}

/**
 * Requirements the profile does not fully support and that may be covered, in
 * posting order: everything except credentials and personal circumstances.
 */
export function listGaps(analysis: JobAnalysis, evidence: EvidenceMap): Gap[] {
  const gaps: Gap[] = [];
  for (const requirement of analysis.requirements) {
    const match = evidence.matches.find((candidate) => candidate.requirementId === requirement.id);
    if (!match || match.status === "supported" || isCredential(requirement)) continue;
    const skills = requirement.relatedSkills.map((skill) => skill.trim()).filter(Boolean);
    const isSkill = SKILL_CATEGORIES.has(requirement.category) && skills.length > 0;
    gaps.push({
      requirementId: requirement.id,
      description: requirement.description,
      kind: isSkill ? "skill" : "experience",
      skills: isSkill ? skills : [],
      missing: match.status === "partially_supported" ? match.missing : "",
      entryId:
        match.evidence.find((ref) => ref.kind !== "project" && ref.kind !== "outcome" && ref.parentId)?.parentId ?? "",
    });
  }
  return gaps;
}

/** Unsupported requirements that are credentials or circumstances: for the owner to answer, never supplied. */
export function listCredentialGaps(analysis: JobAnalysis, evidence: EvidenceMap): string[] {
  return analysis.requirements
    .filter((requirement) => {
      const match = evidence.matches.find((candidate) => candidate.requirementId === requirement.id);
      return match && match.status !== "supported" && isCredential(requirement);
    })
    .map((requirement) => requirement.description);
}

function key(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function displayName(name: string): string {
  const trimmed = name.trim();
  return /^[a-z][a-z ]{3,}$/.test(trimmed) ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
}

/** A supplied bullet is one plain sentence: no numbers or links to invent, nothing that looks like markup. */
function usableBullet(text: string): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 20 || cleaned.length > 240) return null;
  if (/\d/.test(cleaned) || /https?:|www\.|[<>{}]/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Decide what to add for each gap. Skill names must come from the posting's
 * own requirement; bullets are written by the model and filtered. In a role
 * that already has five or more bullets, a bullet takes the place of a routine
 * responsibility that relates to nothing in this job; otherwise it is added.
 * Nothing here changes `content`.
 */
export function planSupplied(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  evidence: EvidenceMap;
  /** Tailored content the additions will be applied to. */
  content: ResumeContent;
  model: TailoringAiOutput["gapFill"];
}): SuppliedContent {
  const { profile, analysis, evidence, content, model } = input;
  const gaps = listGaps(analysis, evidence);
  const covered = new Set<string>();

  const known = new Set(profile.skills.map((skill) => key(skill.name)));
  const categories = new Map(profile.skills.map((skill) => [key(skill.category || OTHER_CATEGORY), skill.category]));
  const skills: SuppliedContent["skills"] = [];
  for (const gap of gaps.filter((item) => item.kind === "skill")) {
    const requirement = analysis.requirements.find((item) => item.id === gap.requirementId);
    const posting = `${gap.description} ${requirement?.supportingText ?? ""}`;
    const proposed = model.skills
      .filter((item) => item.requirementId === gap.requirementId)
      .filter(
        (item) =>
          item.name.trim().length <= 60 &&
          (gap.skills.some((skill) => key(skill) === key(item.name)) || containsTerm(posting, item.name)),
      );
    const names = proposed.length > 0 ? proposed : gap.skills.map((name) => ({ name, category: "" }));
    for (const item of names) {
      const name = displayName(item.name);
      if (!key(name) || known.has(key(name)) || skills.length >= MAX_SUPPLIED_SKILLS) continue;
      known.add(key(name));
      covered.add(gap.requirementId);
      skills.push({
        id: newId("supplied"),
        requirementId: gap.requirementId,
        requirement: gap.description,
        name,
        category: categories.get(key(item.category)) ?? OTHER_CATEGORY,
      });
    }
    // A skill the profile already lists under another spelling needs nothing added.
    if (gap.skills.every((skill) => known.has(key(skill)))) covered.add(gap.requirementId);
  }

  // Only routine responsibility statements may be swapped out, never achievements and never a
  // bullet that speaks to some requirement of this job, and at most two per role.
  const relevant = new Set(evidence.matches.flatMap((match) => match.evidence.map((ref) => ref.id)));
  const responsibilities = new Set(
    profile.experience.flatMap((entry) => entry.responsibilities.map((statement) => statement.id)),
  );
  const taken = new Set<string>();
  const swapsPerRole = new Map<string, number>();
  const bullets: SuppliedContent["bullets"] = [];
  for (const gap of gaps.filter((item) => item.kind === "experience")) {
    if (bullets.length >= MAX_SUPPLIED_BULLETS) break;
    const proposed = model.bullets.find((item) => item.requirementId === gap.requirementId);
    const text = proposed ? usableBullet(proposed.text) : null;
    if (!text) continue;
    const role =
      content.experience.find((entry) => entry.id === proposed?.entryId) ??
      content.experience.find((entry) => entry.id === gap.entryId) ??
      content.experience[0];
    if (!role) continue;
    const replaceable =
      role.bullets.length >= 5 && (swapsPerRole.get(role.id) ?? 0) < MAX_SWAPS_PER_ROLE
        ? [...role.bullets]
            .reverse()
            .find(
              (bullet) =>
                bullet.kind !== "user_provided" &&
                bullet.sourceIds.length > 0 &&
                bullet.sourceIds.every((id) => responsibilities.has(id)) &&
                !bullet.sourceIds.some((id) => relevant.has(id)) &&
                !taken.has(bullet.id),
            )
        : undefined;
    if (replaceable) {
      taken.add(replaceable.id);
      swapsPerRole.set(role.id, (swapsPerRole.get(role.id) ?? 0) + 1);
    }
    covered.add(gap.requirementId);
    bullets.push({
      id: newId("supplied"),
      requirementId: gap.requirementId,
      requirement: gap.description,
      entryId: role.id,
      entryLabel: `${role.title} at ${role.employer}`,
      text,
      replacesSourceIds: replaceable?.sourceIds ?? [],
      replacedText: replaceable?.text ?? "",
    });
  }

  return {
    skills,
    bullets,
    uncovered: gaps.filter((gap) => !covered.has(gap.requirementId)).map((gap) => gap.description),
    credentials: listCredentialGaps(analysis, evidence),
  };
}

export function hasSupplied(supplied: SuppliedContent | null | undefined): supplied is SuppliedContent {
  return Boolean(supplied && (supplied.skills.length > 0 || supplied.bullets.length > 0));
}

/** Add the supplied skills and bullets to resume content. Additions stay marked as supplied. */
export function applySupplied(content: ResumeContent, supplied: SuppliedContent | null): ResumeContent {
  if (!hasSupplied(supplied)) return content;
  const result: ResumeContent = structuredClone(content);
  const listed = new Set(result.skills.map((skill) => key(skill.name)));
  for (const skill of supplied.skills) {
    if (listed.has(key(skill.name))) continue;
    listed.add(key(skill.name));
    result.skills.push({ id: skill.id, name: skill.name, category: skill.category, supplied: true });
  }
  for (const item of supplied.bullets) {
    const role = result.experience.find((entry) => entry.id === item.entryId);
    if (!role) continue;
    const bullet: ResumeBullet = { id: item.id, text: item.text, sourceIds: [], kind: "supplied" };
    const index =
      item.replacesSourceIds.length > 0
        ? role.bullets.findIndex(
            (candidate) =>
              candidate.sourceIds.length === item.replacesSourceIds.length &&
              candidate.sourceIds.every((id) => item.replacesSourceIds.includes(id)),
          )
        : -1;
    if (index >= 0) role.bullets[index] = bullet;
    else role.bullets.push(bullet);
  }
  return result;
}
