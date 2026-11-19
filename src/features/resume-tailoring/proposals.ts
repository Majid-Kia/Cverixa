import { newId } from "@/lib/ids";
import { SECTION_LABELS, type ResumeBullet, type ResumeContent } from "@/types/resume-content";
import { normalizeSectionOrder } from "./build-content";
import type { ClarifyingQuestion, Proposal, ProposalDecision, SuppliedContent } from "./schema";

export const FEATURED_PROPOSAL_ID = "featured";

/**
 * Review Mode (FR-006): derive individual proposals by diffing the tailored
 * content against the baseline (unchanged profile content).
 */
export function createProposals(
  baseline: ResumeContent,
  tailored: ResumeContent,
  supplied: SuppliedContent | null = null,
): Proposal[] {
  const proposals: Proposal[] = [];

  if (baseline.summary.text.trim() !== tailored.summary.text.trim()) {
    proposals.push({
      id: "summary",
      kind: "summary",
      label: "Professional summary",
      original: baseline.summary.text ? [baseline.summary.text] : [],
      proposed: tailored.summary.text ? [tailored.summary.text] : [],
      proposedSourceIds: [tailored.summary.sourceIds],
      note: "",
    });
  }

  const featured = tailored.featured;
  if (featured) {
    const from = featured.subtitle ? ` It comes from ${featured.subtitle} and stays attributed to it.` : "";
    proposals.push({
      id: FEATURED_PROPOSAL_ID,
      kind: "featured_project",
      entryId: featured.entryId,
      label: `Selected project on page one: ${featured.title || featured.subtitle}`,
      original: [],
      proposed: featured.bullets.map((bullet) => bullet.text),
      proposedSourceIds: featured.bullets.map((bullet) => bullet.sourceIds),
      note: `Shown directly under the summary so it lands on the first page.${from} These bullets are moved, not repeated; rejecting this keeps them where they were.`,
    });
  }

  for (const entry of baseline.experience) {
    const proposed = tailored.experience.find((item) => item.id === entry.id);
    const originalLines = entry.bullets.map((bullet) => bullet.text);
    const proposedLines = proposed ? proposed.bullets.map((bullet) => bullet.text) : [];
    if (sameLines(originalLines, proposedLines)) continue;
    const movedOut = featured?.entryKind === "experience" && featured.entryId === entry.id;
    proposals.push({
      id: `experience:${entry.id}`,
      kind: "experience_bullets",
      entryId: entry.id,
      label: `${entry.title} at ${entry.employer}`,
      original: originalLines,
      proposed: proposedLines,
      proposedSourceIds: proposed ? proposed.bullets.map((bullet) => bullet.sourceIds) : [],
      note: movedOut
        ? `The bullets about ${featured.title || "the selected project"} are shown in the selected project instead of here.`
        : "",
    });
  }

  for (const project of baseline.projects) {
    // A project brought forward as the selected project is handled by that proposal.
    if (featured?.entryKind === "project" && featured.entryId === project.id) continue;
    const proposed = tailored.projects.find((item) => item.id === project.id);
    const originalLines = project.bullets.map((bullet) => bullet.text);
    const proposedLines = proposed ? proposed.bullets.map((bullet) => bullet.text) : [];
    if (sameLines(originalLines, proposedLines)) continue;
    proposals.push({
      id: `project:${project.id}`,
      kind: "project_bullets",
      entryId: project.id,
      label: `Project: ${project.name}`,
      original: originalLines,
      proposed: proposedLines,
      proposedSourceIds: proposed ? proposed.bullets.map((bullet) => bullet.sourceIds) : [],
      note: "",
    });
  }

  const baselineSkills = baseline.skills.map((skill) => skill.name);
  const tailoredSkills = tailored.skills.map((skill) => skill.name);
  if (!sameLines(baselineSkills, tailoredSkills)) {
    proposals.push({
      id: "skills",
      kind: "skills",
      label: "Skill ordering",
      original: baselineSkills,
      proposed: tailoredSkills,
      proposedSourceIds: [],
      note: "",
    });
  }

  if (baseline.sectionOrder.join("|") !== tailored.sectionOrder.join("|")) {
    proposals.push({
      id: "sections",
      kind: "section_order",
      label: "Section order",
      original: baseline.sectionOrder.map((key) => SECTION_LABELS[key]),
      proposed: tailored.sectionOrder.map((key) => SECTION_LABELS[key]),
      proposedSourceIds: [],
      note: "",
    });
  }

  proposals.push(...suppliedProposals(supplied));
  return proposals;
}

export const SUPPLIED_SKILLS_PROPOSAL_ID = "supplied:skills";

/**
 * Additions that cover requirements the profile has no evidence for. Each is
 * its own proposal so the owner decides on them one by one.
 */
function suppliedProposals(supplied: SuppliedContent | null): Proposal[] {
  if (!supplied) return [];
  const proposals: Proposal[] = [];
  if (supplied.skills.length > 0) {
    proposals.push({
      id: SUPPLIED_SKILLS_PROPOSAL_ID,
      kind: "supplied_skills",
      label: "Skills added to cover the job",
      original: [],
      proposed: supplied.skills.map((skill) => skill.name),
      proposedSourceIds: [],
      note: "Not in your profile. The job asks for these and nothing in your confirmed data shows them. Accept only the ones you have; use Edit to remove any (one skill per line).",
    });
  }
  for (const bullet of supplied.bullets) {
    const requirement = bullet.requirement.length > 80 ? `${bullet.requirement.slice(0, 79)}...` : bullet.requirement;
    proposals.push({
      id: `supplied:${bullet.id}`,
      kind: "supplied_bullet",
      entryId: bullet.entryId,
      label: `Added to cover: ${requirement}`,
      original: bullet.replacedText ? [bullet.replacedText] : [],
      proposed: [bullet.text],
      proposedSourceIds: [[]],
      note: `Not from your profile. Placed under ${bullet.entryLabel}${
        bullet.replacedText ? ", in place of a bullet that does not relate to this job" : ""
      }. Accept it only if it is true for you; use Edit to put it in your own words.`,
    });
  }
  return proposals;
}

/** The supplied additions the owner accepted in Review Mode, with their edits. */
export function acceptedSupplied(
  supplied: SuppliedContent | null,
  decisions: ProposalDecision[],
): SuppliedContent | null {
  if (!supplied) return null;
  const accepted = (id: string) =>
    decisions.find((decision) => decision.proposalId === id && decision.decision === "accept");
  const skillsDecision = accepted(SUPPLIED_SKILLS_PROPOSAL_ID);
  const names = skillsDecision
    ? (skillsDecision.editedLines ?? supplied.skills.map((skill) => skill.name))
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const skills = names.map((name) => {
    const original = supplied.skills.find((skill) => skill.name.toLowerCase() === name.toLowerCase());
    return (
      original ?? {
        id: newId("supplied"),
        requirementId: "",
        requirement: "Added by you in review",
        name,
        category: "Other",
      }
    );
  });
  const bullets = supplied.bullets.flatMap((bullet) => {
    const decision = accepted(`supplied:${bullet.id}`);
    if (!decision) return [];
    const edited = decision.editedLines?.join(" ").replace(/\s+/g, " ").trim();
    return edited === "" ? [] : [{ ...bullet, text: edited ?? bullet.text }];
  });
  return { skills, bullets, uncovered: supplied.uncovered, credentials: supplied.credentials };
}

/**
 * Compose the final content from the baseline, applying accepted proposals
 * (with optional user edits). Rejected or undecided proposals keep the
 * original content. The master profile is never touched.
 */
export function applyDecisions(
  baseline: ResumeContent,
  tailored: ResumeContent,
  proposals: Proposal[],
  decisions: ProposalDecision[],
): ResumeContent {
  const decisionFor = (id: string) => decisions.find((decision) => decision.proposalId === id);
  const result: ResumeContent = structuredClone(baseline);

  for (const proposal of proposals) {
    const decision = decisionFor(proposal.id);
    if (!decision || decision.decision !== "accept") continue;
    const lines = decision.editedLines ?? proposal.proposed;

    switch (proposal.kind) {
      case "summary":
        result.summary = { text: lines[0] ?? "", sourceIds: tailored.summary.sourceIds };
        break;
      case "featured_project": {
        if (!tailored.featured) break;
        const bullets = mergeBullets(tailored.featured.bullets, lines, proposal.proposedSourceIds);
        if (bullets.length || tailored.featured.description) result.featured = { ...tailored.featured, bullets };
        break;
      }
      case "experience_bullets": {
        const target = result.experience.find((entry) => entry.id === proposal.entryId);
        const source = tailored.experience.find((entry) => entry.id === proposal.entryId);
        if (!target || !source) break;
        const bullets = mergeBullets(source.bullets, lines, proposal.proposedSourceIds);
        if (bullets.length) target.bullets = bullets;
        break;
      }
      case "project_bullets": {
        const target = result.projects.find((entry) => entry.id === proposal.entryId);
        const source = tailored.projects.find((entry) => entry.id === proposal.entryId);
        if (!target) break;
        if (!source) {
          result.projects = result.projects.filter((entry) => entry.id !== proposal.entryId);
          break;
        }
        target.bullets = mergeBullets(source.bullets, lines, proposal.proposedSourceIds);
        break;
      }
      case "skills":
        result.skills = tailored.skills;
        break;
      case "section_order":
        result.sectionOrder = tailored.sectionOrder;
        break;
    }
  }
  return reconcileFeatured(result, tailored);
}

/**
 * Keep exactly one description of the selected project whatever mix of
 * proposals was accepted: when it is shown, its statements are removed from
 * the source role or from Projects; when it is not, they go back to the role.
 */
function reconcileFeatured(result: ResumeContent, tailored: ResumeContent): ResumeContent {
  const proposed = tailored.featured;
  if (!proposed) return result;
  const shown = result.featured;
  if (shown) {
    result.sectionOrder = normalizeSectionOrder(result.sectionOrder);
    if (shown.entryKind === "project") {
      result.projects = result.projects.filter((project) => project.id !== shown.entryId);
      return result;
    }
    const sources = new Set(proposed.bullets.flatMap((bullet) => bullet.sourceIds));
    const role = result.experience.find((entry) => entry.id === shown.entryId);
    if (role) {
      role.bullets = role.bullets.filter(
        (bullet) => !(bullet.sourceIds.length > 0 && bullet.sourceIds.every((id) => sources.has(id))),
      );
    }
    return result;
  }
  if (proposed.entryKind === "experience") {
    const role = result.experience.find((entry) => entry.id === proposed.entryId);
    if (role) {
      const cited = new Set(role.bullets.flatMap((bullet) => bullet.sourceIds));
      const missing = proposed.bullets.filter((bullet) => !bullet.sourceIds.some((id) => cited.has(id)));
      role.bullets = [...missing, ...role.bullets];
    }
  }
  return result;
}

/**
 * Add the owner's answer to the brief's question to the entry it is about, in
 * their own words. It goes into the selected project when that shows the
 * entry, otherwise under the role or project itself.
 */
export function applyAnswer(
  content: ResumeContent,
  question: ClarifyingQuestion,
  text: string,
  profileFactId: string | null,
): ResumeContent {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return content;
  const bullet: ResumeBullet = {
    id: newId("b"),
    text: trimmed,
    sourceIds: profileFactId ? [profileFactId] : [],
    kind: "user_provided",
  };
  const result: ResumeContent = structuredClone(content);
  if (result.featured?.entryId === question.entryId) {
    result.featured.bullets.push(bullet);
    return result;
  }
  const target =
    question.entryKind === "experience"
      ? result.experience.find((entry) => entry.id === question.entryId)
      : result.projects.find((entry) => entry.id === question.entryId);
  if (target) target.bullets.push(bullet);
  return result;
}

function mergeBullets(proposed: ResumeBullet[], lines: string[], sourceIds: string[][]): ResumeBullet[] {
  return lines
    .map((text, index) => ({
      id: proposed[index]?.id ?? newId("b"),
      text: text.trim(),
      sourceIds: proposed[index]?.sourceIds ?? sourceIds[index] ?? [],
      kind:
        proposed[index] && proposed[index].text.trim() === text.trim() ? proposed[index].kind : ("reworded" as const),
    }))
    .filter((bullet) => bullet.text.length > 0);
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, index) => line.trim() === b[index].trim());
}
