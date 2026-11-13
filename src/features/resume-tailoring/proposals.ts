import { newId } from "@/lib/ids";
import { SECTION_LABELS, type ResumeBullet, type ResumeContent } from "@/types/resume-content";
import { normalizeSectionOrder } from "./build-content";
import type { ClarifyingQuestion, Proposal, ProposalDecision } from "./schema";

export const FEATURED_PROPOSAL_ID = "featured";

/**
 * Review Mode (FR-006): derive individual proposals by diffing the tailored
 * content against the baseline (unchanged profile content).
 */
export function createProposals(baseline: ResumeContent, tailored: ResumeContent): Proposal[] {
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

  return proposals;
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
