import { visibleSections, type ResumeContent, type ResumeSectionKey } from "@/types/resume-content";
import {
  SECTION_TITLES,
  contactItems,
  dateRange,
  documentShell,
  esc,
  featuredHeader,
  groupSkills,
  link,
  type ResumeTemplate,
  type TemplateRenderOptions,
} from "../shared";

const MARGINS = "12mm 14mm";

/**
 * Template B: Jake-Inspired. Compact, high-density single column with a strong
 * experience hierarchy. Independently implemented; no third-party template code.
 */
const CSS = `
  body { font-family: "Inter", Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: #111; }
  .header { text-align: center; margin-bottom: 6pt; }
  .name { font-size: 22pt; font-weight: 700; margin: 0; letter-spacing: 0.02em; }
  .headline { font-size: 11pt; font-weight: 500; margin: 1pt 0 0; }
  .contact { font-size: 9.5pt; margin-top: 3pt; }
  .contact span + span::before { content: " | "; color: #666; }
  h2 { font-size: 11.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 9pt 0 3pt; padding-bottom: 1pt; border-bottom: 0.8pt solid #111; }
  .entry { margin-bottom: 5pt; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
  .title { font-size: 10.5pt; font-weight: 600; }
  .sub { font-style: italic; color: #222; }
  .dates { font-size: 9.5pt; white-space: nowrap; }
  ul.bullets { padding-left: 11pt; margin-top: 1pt; }
  ul.bullets li { margin: 0.5pt 0; }
  .tech { font-size: 9.5pt; color: #333; }
  .skills p { margin: 1pt 0; }
  .skills strong { font-weight: 600; }
  .summary { margin: 0; }
`;

function section(key: ResumeSectionKey, content: ResumeContent): string {
  const title = `<h2>${esc(SECTION_TITLES[key])}</h2>`;
  switch (key) {
    case "summary":
      return `${title}<p class="summary">${esc(content.summary.text)}</p>`;
    case "featured": {
      const featured = content.featured;
      if (!featured) return "";
      const head = featuredHeader(featured);
      return `${title}<div class="entry">
  <div class="row"><span class="title">${head.heading}${featured.technologies.length ? ` <span class="tech">| ${esc(featured.technologies.join(", "))}</span>` : ""}</span><span class="dates">${head.dates}</span></div>
  ${head.sub ? `<div class="sub">${head.sub}</div>` : ""}
  ${featured.description ? `<div>${esc(featured.description)}</div>` : ""}
  ${featured.bullets.length ? `<ul class="bullets">${featured.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
</div>`;
    }
    case "experience":
      return (
        title +
        content.experience
          .map(
            (entry) => `<div class="entry">
  <div class="row"><span class="title">${esc(entry.title)}</span><span class="dates">${dateRange(entry.startDate, entry.endDate)}</span></div>
  <div class="row"><span class="sub">${esc(entry.employer)}</span><span class="dates sub">${esc(entry.location)}</span></div>
  ${entry.bullets.length ? `<ul class="bullets">${entry.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
</div>`,
          )
          .join("")
      );
    case "skills":
      return `${title}<div class="skills">${groupSkills(content)
        .map((group) => `<p><strong>${esc(group.category)}:</strong> ${esc(group.skills.join(", "))}</p>`)
        .join("")}</div>`;
    case "projects":
      return (
        title +
        content.projects
          .map(
            (project) => `<div class="entry">
  <div class="row"><span class="title">${esc(project.name)}${project.technologies.length ? ` <span class="tech">| ${esc(project.technologies.join(", "))}</span>` : ""}</span><span class="dates">${[
    project.url,
    project.repositoryUrl,
  ]
    .filter(Boolean)
    .map((u) => link(u))
    .join(" | ")}</span></div>
  ${project.description ? `<div>${esc(project.description)}</div>` : ""}
  ${project.bullets.length ? `<ul class="bullets">${project.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
</div>`,
          )
          .join("")
      );
    case "education":
      return (
        title +
        content.education
          .map(
            (entry) => `<div class="entry">
  <div class="row"><span class="title">${esc(entry.institution)}</span><span class="dates">${dateRange(entry.startDate, entry.endDate)}</span></div>
  <div class="sub">${esc([entry.degree, entry.fieldOfStudy].filter(Boolean).join(", "))}</div>
  ${entry.details.length ? `<ul class="bullets">${entry.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
</div>`,
          )
          .join("")
      );
    case "certifications":
      return `${title}<ul class="bullets">${content.certifications
        .map(
          (c) =>
            `<li>${esc(c.name)}${c.issuer ? ` &ndash; ${esc(c.issuer)}` : ""}${c.date ? ` (${esc(c.date)})` : ""}${c.credentialUrl ? ` | ${link(c.credentialUrl, "Credential")}` : ""}</li>`,
        )
        .join("")}</ul>`;
    case "languages":
      return `${title}<p class="summary">${content.languages.map((l) => `${esc(l.language)}${l.proficiency ? ` (${esc(l.proficiency)})` : ""}`).join(", ")}</p>`;
    case "additional":
      return content.additionalSections
        .filter((s) => s.items.length > 0)
        .map(
          (s) =>
            `<h2>${esc(s.title)}</h2><ul class="bullets">${s.items
              .map(
                (item) =>
                  `<li><strong>${esc(item.title)}</strong>${item.date ? ` (${esc(item.date)})` : ""}${item.description ? ` &ndash; ${esc(item.description)}` : ""}${item.url ? ` | ${link(item.url)}` : ""}</li>`,
              )
              .join("")}</ul>`,
        )
        .join("");
  }
}

export const jakeInspiredTemplate: ResumeTemplate = {
  id: "jake-inspired",
  name: "Jake-Inspired",
  description: "Compact, information-dense single column emphasising technical achievements.",
  render(content: ResumeContent, options: TemplateRenderOptions): string {
    const contacts = contactItems(content);
    const body = `
<header class="header">
  <h1 class="name">${esc(content.personal.fullName)}</h1>
  ${content.personal.headline ? `<p class="headline">${esc(content.personal.headline)}</p>` : ""}
  ${contacts.length ? `<div class="contact">${contacts.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}
</header>
${visibleSections(content)
  .map((key) => section(key, content))
  .join("\n")}`;
    return documentShell({ title: `${content.personal.fullName} - Resume`, css: CSS, body, options, margins: MARGINS });
  },
};
