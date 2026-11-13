import type { CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm, TECH_KEYWORDS } from "@/features/job-analysis/keywords";
import { SECTION_TITLES } from "@/templates/shared";
import { visibleSections, type ResumeContent } from "@/types/resume-content";

/**
 * Checks on resume content and on the text of an exported PDF. They report
 * problems for the owner to fix; they never change content or block a download.
 */
export interface QualityWarning {
  code: "trailing_page" | "duplicate_skill_label" | "headline_mismatch" | "featured_not_on_first_page";
  message: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse free-text dates such as "Mar 2021", "2021-03" or "2021" into a fractional year. */
export function parseDate(text: string): number | null {
  const year = text.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;
  let month = 0;
  const named = text.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const iso = text.match(/\b(?:19|20)\d{2}[-/.](\d{1,2})\b/);
  const reversed = text.match(/\b(\d{1,2})[-/.](?:19|20)\d{2}\b/);
  if (named) month = MONTHS.indexOf(named[1]);
  else if (iso) month = Math.min(11, Math.max(0, Number(iso[1]) - 1));
  else if (reversed) month = Math.min(11, Math.max(0, Number(reversed[1]) - 1));
  return Number(year[0]) + month / 12;
}

export interface HeadlineCheckInput {
  headline: string;
  summary: string;
  roles: Array<{ title: string; startDate: string; endDate: string }>;
  /** Everything else on the resume a headline keyword could be backed by. */
  supportingText: string;
  now?: Date;
}

const YEARS_CLAIM = /(\d{1,2})\s*(\+)?\s*(?:years?|yrs?)\b/i;

interface YearsClaim {
  raw: string;
  years: number;
  /** "8+ years": at least that many. */
  openEnded: boolean;
  /** About experience overall, not "5 years of React". */
  general: boolean;
}

function yearsClaim(text: string): YearsClaim | null {
  const match = text.match(YEARS_CLAIM);
  if (!match || match.index === undefined) return null;
  const rest = text.slice(match.index + match[0].length);
  const general = /^\s*(?:(?:of\s+)?(?:professional\s+|industry\s+|work\s+)?experience\b|[|,.;)·-]|$)/i.test(rest);
  return { raw: match[0].trim(), years: Number(match[1]), openEnded: Boolean(match[2]), general };
}

function claimsAgree(a: YearsClaim, b: YearsClaim): boolean {
  if (a.openEnded && b.openEnded) return true;
  if (a.openEnded) return b.years >= a.years;
  if (b.openEnded) return a.years >= b.years;
  return a.years === b.years;
}
const HEADLINE_TERMS_IGNORED = new Set(["architecture", "leadership", "mentoring", "agile", "scrum", "rest", "node"]);

/**
 * Obvious contradictions between the headline and the rest of the profile:
 * a years-of-experience claim the listed roles do not bear out (for example
 * "1+ years" above eight years of roles), a different figure in the summary,
 * a seniority that contradicts the latest title, or a technology named only
 * in the headline.
 */
export function checkHeadline(input: HeadlineCheckInput): string[] {
  const headline = input.headline.trim();
  if (!headline) return [];
  const issues: string[] = [];
  const now = input.now ?? new Date();
  const today = now.getFullYear() + now.getMonth() / 12;

  const starts = input.roles.map((role) => parseDate(role.startDate)).filter((value) => value !== null);
  const ends = input.roles.map((role) =>
    !role.endDate.trim() || /present|current|now/i.test(role.endDate) ? today : parseDate(role.endDate),
  );
  const knownEnds = ends.filter((value) => value !== null);
  const claim = yearsClaim(headline);
  let spanIssue = false;
  if (claim && starts.length > 0 && knownEnds.length > 0) {
    const first = Math.min(...starts);
    const last = Math.max(...knownEnds);
    const span = last - first;
    const overstated = claim.years > span + 1.5;
    // A claim about one technology ("5 years of React") may rightly be shorter than the career.
    const understated =
      claim.general && (claim.openEnded ? span - claim.years >= 3 && claim.years <= span / 2 : span - claim.years >= 2);
    if (overstated || understated) {
      spanIssue = true;
      const lastLabel = last >= today - 0.01 ? "Present" : String(Math.floor(last));
      issues.push(
        `The headline says "${claim.raw}" but the roles listed span about ${Math.round(span)} years (${Math.floor(first)} - ${lastLabel}).`,
      );
    }
  }
  const summaryClaim = yearsClaim(input.summary);
  if (
    claim &&
    summaryClaim &&
    !spanIssue &&
    claim.general &&
    summaryClaim.general &&
    !claimsAgree(claim, summaryClaim)
  ) {
    issues.push(`The headline says "${claim.raw}" while the summary says "${summaryClaim.raw}".`);
  }

  const latestTitle = input.roles[0]?.title ?? "";
  if (
    /\b(junior|intern|graduate|entry[- ]level)\b/i.test(headline) &&
    /\b(senior|lead|staff|principal|head|director|manager)\b/i.test(latestTitle)
  ) {
    issues.push(`The headline reads as junior but the most recent title is "${latestTitle}".`);
  }

  for (const term of TECH_KEYWORDS) {
    if (HEADLINE_TERMS_IGNORED.has(term)) continue;
    if (containsTerm(headline, term) && !containsTerm(input.supportingText, term)) {
      issues.push(`The headline mentions "${term}", which does not appear anywhere else in the resume.`);
    }
  }
  return issues;
}

/** Headline check for a resume as it will be rendered. */
export function headlineIssuesForContent(content: ResumeContent, now?: Date): string[] {
  return checkHeadline({
    headline: content.personal.headline,
    summary: content.summary.text,
    roles: content.experience,
    supportingText: [
      content.summary.text,
      ...content.skills.map((skill) => skill.name),
      ...content.experience.flatMap((entry) => [
        entry.title,
        ...entry.technologies,
        ...entry.bullets.map((b) => b.text),
      ]),
      ...content.projects.flatMap((project) => [
        project.name,
        project.description,
        ...project.technologies,
        ...project.bullets.map((b) => b.text),
      ]),
      ...(content.featured ? [content.featured.title, ...content.featured.bullets.map((b) => b.text)] : []),
      ...content.certifications.map((certification) => certification.name),
    ].join(" \n "),
    now,
  });
}

/** Headline check for the confirmed profile, before any drafting. */
export function headlineIssuesForProfile(profile: CareerProfileData, now?: Date): string[] {
  return checkHeadline({
    headline: profile.personal.headline,
    summary: profile.summary.text,
    roles: profile.experience,
    supportingText: [
      profile.summary.text,
      ...profile.summary.keyStrengths,
      ...profile.summary.specializations,
      ...profile.skills.map((skill) => skill.name),
      ...profile.experience.flatMap((entry) => [
        entry.title,
        ...entry.technologies,
        ...entry.responsibilities.map((statement) => statement.text),
        ...entry.achievements.map((achievement) => achievement.text),
      ]),
      ...profile.projects.flatMap((project) => [
        project.name,
        project.description,
        ...project.technologies,
        ...project.outcomes.map((outcome) => outcome.text),
      ]),
      ...profile.certifications.map((certification) => certification.name),
    ].join(" \n "),
    now,
  });
}

function labelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

/**
 * Repeated labels in the skills area: the same skill listed twice, or an
 * additional section whose heading repeats a built-in one (a second "Skills"
 * or "Languages" block, typically left over from an import).
 */
export function duplicateSkillLabels(content: ResumeContent): string[] {
  const issues: string[] = [];
  const visible = visibleSections(content);

  if (visible.includes("skills")) {
    const seen = new Map<string, string[]>();
    for (const skill of content.skills) {
      const key = labelKey(skill.name);
      if (!key) continue;
      seen.set(key, [...(seen.get(key) ?? []), skill.category || "General"]);
    }
    for (const [key, categories] of seen) {
      if (categories.length < 2) continue;
      const name = content.skills.find((skill) => labelKey(skill.name) === key)?.name ?? key;
      const where = [...new Set(categories)];
      issues.push(
        where.length > 1
          ? `The skill "${name}" is listed ${categories.length} times (under ${where.join(" and ")}).`
          : `The skill "${name}" is listed ${categories.length} times.`,
      );
    }
  }

  if (visible.includes("additional")) {
    const headings = new Map<string, string>();
    for (const key of visible) {
      if (key !== "additional") headings.set(labelKey(SECTION_TITLES[key]), SECTION_TITLES[key]);
    }
    if (visible.includes("skills")) headings.set("technical skills", "Skills").set("skills", "Skills");
    for (const section of content.additionalSections.filter((item) => item.items.length > 0)) {
      const key = labelKey(section.title);
      const clash = headings.get(key);
      if (clash) issues.push(`The section heading "${section.title}" appears twice (it repeats the ${clash} section).`);
      else headings.set(key, section.title);
    }
  }
  return issues;
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A last page that carries only a few lines, typically the tail of Skills or
 * Languages. `pages` is the extracted text of each PDF page.
 */
export function trailingPageIssue(pages: string[], content: ResumeContent): string | null {
  if (pages.length < 2) return null;
  const last = squash(pages[pages.length - 1]);
  const others = pages.slice(0, -1).map((page) => squash(page).length);
  const average = others.reduce((sum, length) => sum + length, 0) / others.length;
  if (last.length === 0) return `Page ${pages.length} of the PDF is blank.`;
  if (last.length >= 450 || last.length >= average * 0.2) return null;

  const titles = visibleSections(content).flatMap((key) =>
    key === "additional"
      ? content.additionalSections.filter((section) => section.items.length > 0).map((section) => section.title)
      : [SECTION_TITLES[key]],
  );
  const lower = last.toLowerCase();
  const onPage = titles.filter((title) => lower.includes(title.toLowerCase()));
  const lines = Math.max(1, Math.round(last.length / 90));
  const what = onPage.length > 0 ? ` (${onPage.join(", ")})` : "";
  return `The PDF ends on page ${pages.length} with only about ${lines} line${lines === 1 ? "" : "s"}${what}. Shorten or reorder content so it does not spill onto a nearly empty page.`;
}

/** The selected project must actually land on page one of the PDF. */
export function featuredPlacementIssue(pages: string[], content: ResumeContent): string | null {
  const featured = content.featured;
  if (!featured || !visibleSections(content).includes("featured") || pages.length === 0) return null;
  const probe = squash(featured.bullets[0]?.text ?? featured.description)
    .slice(0, 40)
    .toLowerCase();
  if (!probe) return null;
  if (squash(pages[0]).toLowerCase().includes(probe)) return null;
  return `The selected project "${featured.title || featured.subtitle}" is not on the first page of the PDF. Move the section up or shorten the summary.`;
}

/** All checks for an exported PDF. */
export function checkExportQuality(content: ResumeContent, pages: string[], now?: Date): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  const trailing = trailingPageIssue(pages, content);
  if (trailing) warnings.push({ code: "trailing_page", message: trailing });
  for (const message of duplicateSkillLabels(content)) warnings.push({ code: "duplicate_skill_label", message });
  for (const message of headlineIssuesForContent(content, now)) warnings.push({ code: "headline_mismatch", message });
  const placement = featuredPlacementIssue(pages, content);
  if (placement) warnings.push({ code: "featured_not_on_first_page", message: placement });
  return warnings;
}
