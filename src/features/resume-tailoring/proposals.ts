import { newId } from "@/lib/ids";
import { SECTION_LABELS, type ResumeBullet, type ResumeContent } from "@/types/resume-content";
import type { Proposal, ProposalDecision } from "./schema";

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
    });
  }

  for (const entry of baseline.experience) {
    const proposed = tailored.experience.find((item) => item.id === entry.id);
    const originalLines = entry.bullets.map((bullet) => bullet.text);
    const proposedLines = proposed ? proposed.bullets.map((bullet) => bullet.text) : [];
    if (sameLines(originalLines, proposedLines)) continue;
    proposals.push({
      id: `experience:${entry.id}`,
      kind: "experience_bullets",
      entryId: entry.id,
      label: `${entry.title} at ${entry.employer}`,
      original: originalLines,
      proposed: proposedLines,
      proposedSourceIds: proposed ? proposed.bullets.map((bullet) => bullet.sourceIds) : [],
    });
  }

  for (const project of baseline.projects) {
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
      case "experience_bullets": {
        const target = result.experience.find((entry) => entry.id === proposal.entryId);
        const source = tailored.experience.find((entry) => entry.id === proposal.entryId);
        if (!target) break;
        if (!source) {
          result.experience = result.experience.filter((entry) => entry.id !== proposal.entryId);
          break;
        }
        target.bullets = mergeBullets(source.bullets, lines, proposal.proposedSourceIds);
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
