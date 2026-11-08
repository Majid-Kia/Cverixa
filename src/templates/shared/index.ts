import type { PageFormat, ResumeContent, ResumeSectionKey } from "@/types/resume-content";

export type TemplateId = "classic-clear" | "jake-inspired" | "engineering-modern";

export interface TemplateRenderOptions {
  pageFormat: PageFormat;
  /** @font-face declarations for bundled Inter (injected by the rendering layer). */
  fontFaceCss: string;
  /** When true, render without print page rules (browser preview). */
  preview?: boolean;
}

export interface ResumeTemplate {
  id: TemplateId;
  name: string;
  description: string;
  render(content: ResumeContent, options: TemplateRenderOptions): string;
}

/** Escape text for safe HTML insertion. Templates must use this for every value. */
export function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only allow http(s) and mailto links; anything else is rendered as plain text. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^(https?:)?\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Display form of a URL without scheme or trailing slash. */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

export function link(url: string, label?: string, className = ""): string {
  const href = safeHref(url);
  const text = esc(label ?? displayUrl(url));
  if (!href) return text;
  return `<a class="${className}" href="${esc(href)}">${text}</a>`;
}

export function dateRange(start: string, end: string): string {
  const to = end.trim() ? end.trim() : "Present";
  if (!start.trim()) return esc(to);
  return `${esc(start)} &ndash; ${esc(to)}`;
}

export function pageCss(pageFormat: PageFormat, margins: string): string {
  const size = pageFormat === "Letter" ? "Letter" : "A4";
  return `@page { size: ${size} portrait; margin: ${margins}; }`;
}

/** Contact line items for the header: returns rendered HTML fragments. */
export function contactItems(content: ResumeContent): string[] {
  const p = content.personal;
  const items: string[] = [];
  if (p.location) items.push(esc(p.location));
  if (p.email) items.push(link(`mailto:${p.email}`, p.email));
  if (p.phone) items.push(esc(p.phone));
  if (p.linkedinUrl) items.push(link(p.linkedinUrl));
  if (p.githubUrl) items.push(link(p.githubUrl));
  if (p.portfolioUrl) items.push(link(p.portfolioUrl));
  for (const extra of p.links) items.push(link(extra.url, extra.label || undefined));
  return items;
}

/** Group skills by category preserving the first-seen order of categories and skills. */
export function groupSkills(content: ResumeContent): Array<{ category: string; skills: string[] }> {
  const groups = new Map<string, string[]>();
  for (const skill of content.skills) {
    const category = skill.category || "General";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(skill.name);
  }
  return [...groups.entries()].map(([category, skills]) => ({ category, skills }));
}

export const SECTION_TITLES: Record<ResumeSectionKey, string> = {
  summary: "Professional Summary",
  experience: "Professional Experience",
  skills: "Skills",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  languages: "Languages",
  additional: "Additional",
};

/** Shared print-safety CSS applied by all templates. */
export const PRINT_SAFETY_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; word-break: break-word; overflow-wrap: anywhere; }
  p, li, h1, h2, h3, div, span { overflow-wrap: anywhere; }
  h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
  .entry { break-inside: avoid; page-break-inside: avoid; }
  ul { margin: 0; padding: 0; }
  li { orphans: 2; widows: 2; }
  img { display: none; }
`;

export function previewWrapperCss(pageFormat: PageFormat, margins: string): string {
  const width = pageFormat === "Letter" ? "8.5in" : "210mm";
  return `
  body { background: #e5e7eb; padding: 16px 0; }
  .page { width: ${width}; min-height: ${pageFormat === "Letter" ? "11in" : "297mm"}; margin: 0 auto; background: #fff; padding: ${margins}; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  `;
}

/** Wrap a document body in either print mode (no wrapper) or preview mode (page-sized wrapper). */
export function documentShell(input: {
  title: string;
  css: string;
  body: string;
  options: TemplateRenderOptions;
  margins: string;
}): string {
  const { title, css, body, options, margins } = input;
  const layoutCss = options.preview
    ? previewWrapperCss(options.pageFormat, margins)
    : pageCss(options.pageFormat, margins);
  const inner = options.preview ? `<div class="page">${body}</div>` : body;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${options.fontFaceCss}
${PRINT_SAFETY_CSS}
${layoutCss}
${css}
</style>
</head>
<body>
${inner}
</body>
</html>`;
}
