import { visibleSections, type ResumeContent, type ResumeSectionKey } from "@/types/resume-content";
import {
  SECTION_TITLES,
  contactItems,
  dateRange,
  documentShell,
  esc,
  groupSkills,
  link,
  type ResumeTemplate,
  type TemplateRenderOptions,
} from "../shared";

const MARGINS = "16mm 18mm";

/**
 * Template A: Classic Clear. Single column, clear section separators, strong
 * typographic hierarchy, minimal decoration. Original implementation inspired
 * by the layout characteristics described in the PRD.
 */
const CSS = `
  body { font-family: "Inter", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #1a1a1a; }
  .header { text-align: center; margin-bottom: 8pt; }
  .name { font-size: 22pt; font-weight: 700; letter-spacing: 0.01em; margin: 0; }
  .headline { font-size: 12pt; font-weight: 500; color: #333; margin: 2pt 0 0; }
  .contact { font-size: 9.5pt; color: #444; margin-top: 4pt; }
  .contact span + span::before { content: "\\00a0\\00b7\\00a0"; color: #999; }
  h2 { font-size: 11.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 0.6pt solid #9a9a9a; }
  .entry { margin-bottom: 7pt; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
  .entry-title { font-size: 10.5pt; font-weight: 600; }
  .entry-sub { color: #333; }
  .entry-dates { font-size: 9.5pt; color: #444; white-space: nowrap; }
  ul.bullets { padding-left: 12pt; margin-top: 2pt; }
  ul.bullets li { margin: 1.5pt 0; }
  .tech { font-size: 9.5pt; color: #444; margin-top: 2pt; }
  .skills-row { display: flex; gap: 6pt; margin: 2pt 0; }
  .skills-row .cat { font-weight: 600; min-width: 90pt; }
  .summary { margin: 0; }
  .inline-list { margin: 0; }
`;

function renderSection(key: ResumeSectionKey, content: ResumeContent): string {
  const title = `<h2>${esc(SECTION_TITLES[key])}</h2>`;
  switch (key) {
    case "summary":
      return `${title}<p class="summary">${esc(content.summary.text)}</p>`;
    case "experience":
      return (
        title +
        content.experience
          .map(
            (entry) => `<div class="entry">
  <div class="entry-head"><span class="entry-title">${esc(entry.title)}</span><span class="entry-dates">${dateRange(entry.startDate, entry.endDate)}</span></div>
  <div class="entry-head"><span class="entry-sub">${esc(entry.employer)}${entry.location ? ` &middot; ${esc(entry.location)}` : ""}</span></div>
  ${entry.bullets.length ? `<ul class="bullets">${entry.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
  ${entry.technologies.length ? `<div class="tech"><strong>Technologies:</strong> ${esc(entry.technologies.join(", "))}</div>` : ""}
</div>`,
          )
          .join("")
      );
    case "skills":
      return (
        title +
        groupSkills(content)
          .map(
            (group) =>
              `<div class="skills-row"><span class="cat">${esc(group.category)}</span><span>${esc(group.skills.join(", "))}</span></div>`,
          )
          .join("")
      );
    case "projects":
      return (
        title +
        content.projects
          .map(
            (project) => `<div class="entry">
  <div class="entry-head"><span class="entry-title">${esc(project.name)}${project.role ? ` <span class="entry-sub">&ndash; ${esc(project.role)}</span>` : ""}</span><span class="entry-dates">${[
    project.url,
    project.repositoryUrl,
  ]
    .filter(Boolean)
    .map((u) => link(u))
    .join(" &middot; ")}</span></div>
  ${project.description ? `<div>${esc(project.description)}</div>` : ""}
  ${project.bullets.length ? `<ul class="bullets">${project.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
  ${project.technologies.length ? `<div class="tech"><strong>Technologies:</strong> ${esc(project.technologies.join(", "))}</div>` : ""}
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
  <div class="entry-head"><span class="entry-title">${esc(entry.institution)}</span><span class="entry-dates">${dateRange(entry.startDate, entry.endDate)}</span></div>
  <div class="entry-sub">${esc([entry.degree, entry.fieldOfStudy].filter(Boolean).join(", "))}</div>
  ${entry.details.length ? `<ul class="bullets">${entry.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
</div>`,
          )
          .join("")
      );
    case "certifications":
      return (
        title +
        `<ul class="bullets">${content.certifications
          .map(
            (c) =>
              `<li><strong>${esc(c.name)}</strong>${c.issuer ? `, ${esc(c.issuer)}` : ""}${c.date ? ` (${esc(c.date)})` : ""}${c.credentialUrl ? ` &middot; ${link(c.credentialUrl, "Credential")}` : ""}</li>`,
          )
          .join("")}</ul>`
      );
    case "languages":
      return (
        title +
        `<p class="inline-list">${content.languages.map((l) => `${esc(l.language)}${l.proficiency ? ` (${esc(l.proficiency)})` : ""}`).join(" &middot; ")}</p>`
      );
    case "additional":
      return content.additionalSections
        .filter((section) => section.items.length > 0)
        .map(
          (section) =>
            `<h2>${esc(section.title)}</h2><ul class="bullets">${section.items
              .map(
                (item) =>
                  `<li><strong>${esc(item.title)}</strong>${item.date ? ` (${esc(item.date)})` : ""}${item.description ? ` &ndash; ${esc(item.description)}` : ""}${item.url ? ` &middot; ${link(item.url)}` : ""}</li>`,
              )
              .join("")}</ul>`,
        )
        .join("");
  }
}

export const classicClearTemplate: ResumeTemplate = {
  id: "classic-clear",
  name: "Classic Clear",
  description: "Single-column, classic layout with clear separators. Suited to corporate and technical roles.",
  render(content: ResumeContent, options: TemplateRenderOptions): string {
    const contacts = contactItems(content);
    const body = `
<header class="header">
  <h1 class="name">${esc(content.personal.fullName)}</h1>
  ${content.personal.headline ? `<p class="headline">${esc(content.personal.headline)}</p>` : ""}
  ${contacts.length ? `<div class="contact">${contacts.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}
</header>
${visibleSections(content)
  .map((key) => renderSection(key, content))
  .join("\n")}`;
    return documentShell({ title: `${content.personal.fullName} - Resume`, css: CSS, body, options, margins: MARGINS });
  },
};
