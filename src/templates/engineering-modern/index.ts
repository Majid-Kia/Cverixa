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

const MARGINS = "15mm 17mm";

/**
 * Template C: Engineering Modern. Minimalist layout with a left date column,
 * subtle hierarchy and balanced density. Independently implemented.
 */
const CSS = `
  body { font-family: "Inter", Arial, sans-serif; font-size: 10.5pt; line-height: 1.38; color: #1f2937; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12pt; border-bottom: 1pt solid #1f2937; padding-bottom: 6pt; margin-bottom: 6pt; }
  .name { font-size: 22pt; font-weight: 700; margin: 0; color: #111827; }
  .headline { font-size: 12pt; font-weight: 500; margin: 1pt 0 0; color: #374151; }
  .contact { font-size: 9.5pt; color: #374151; text-align: right; line-height: 1.5; }
  .contact span { display: block; }
  h2 { font-size: 11.5pt; font-weight: 600; color: #111827; margin: 11pt 0 4pt; letter-spacing: 0.02em; }
  h2::after { content: ""; display: block; height: 0.5pt; background: #d1d5db; margin-top: 2pt; }
  .entry { display: grid; grid-template-columns: 78pt 1fr; gap: 8pt; margin-bottom: 7pt; }
  .when { font-size: 9.5pt; color: #4b5563; padding-top: 1pt; }
  .what .title { font-size: 10.5pt; font-weight: 600; color: #111827; }
  .what .org { color: #374151; }
  ul.bullets { padding-left: 11pt; margin-top: 2pt; }
  ul.bullets li { margin: 1.5pt 0; }
  .tech { font-size: 9.5pt; color: #4b5563; margin-top: 2pt; }
  .skills { display: grid; grid-template-columns: 78pt 1fr; gap: 3pt 8pt; }
  .skills .cat { font-weight: 600; color: #111827; font-size: 10pt; }
  .summary { margin: 0; }
  .plain { margin: 0; }
`;

function section(key: ResumeSectionKey, content: ResumeContent): string {
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
  <div class="when">${dateRange(entry.startDate, entry.endDate)}${entry.location ? `<br>${esc(entry.location)}` : ""}</div>
  <div class="what">
    <div class="title">${esc(entry.title)}</div>
    <div class="org">${esc(entry.employer)}</div>
    ${entry.bullets.length ? `<ul class="bullets">${entry.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
    ${entry.technologies.length ? `<div class="tech">${esc(entry.technologies.join(" · "))}</div>` : ""}
  </div>
</div>`,
          )
          .join("")
      );
    case "skills":
      return `${title}<div class="skills">${groupSkills(content)
        .map((group) => `<div class="cat">${esc(group.category)}</div><div>${esc(group.skills.join(", "))}</div>`)
        .join("")}</div>`;
    case "projects":
      return (
        title +
        content.projects
          .map(
            (project) => `<div class="entry">
  <div class="when">${[project.url, project.repositoryUrl]
    .filter(Boolean)
    .map((u) => link(u))
    .join("<br>")}</div>
  <div class="what">
    <div class="title">${esc(project.name)}${project.role ? ` <span class="org">&ndash; ${esc(project.role)}</span>` : ""}</div>
    ${project.description ? `<div>${esc(project.description)}</div>` : ""}
    ${project.bullets.length ? `<ul class="bullets">${project.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : ""}
    ${project.technologies.length ? `<div class="tech">${esc(project.technologies.join(" · "))}</div>` : ""}
  </div>
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
  <div class="when">${dateRange(entry.startDate, entry.endDate)}</div>
  <div class="what">
    <div class="title">${esc(entry.institution)}</div>
    <div class="org">${esc([entry.degree, entry.fieldOfStudy].filter(Boolean).join(", "))}</div>
    ${entry.details.length ? `<ul class="bullets">${entry.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
  </div>
</div>`,
          )
          .join("")
      );
    case "certifications":
      return (
        title +
        content.certifications
          .map(
            (c) => `<div class="entry">
  <div class="when">${esc(c.date)}</div>
  <div class="what"><span class="title">${esc(c.name)}</span>${c.issuer ? ` <span class="org">&ndash; ${esc(c.issuer)}</span>` : ""}${c.credentialUrl ? ` <span class="tech">${link(c.credentialUrl, "Credential")}</span>` : ""}</div>
</div>`,
          )
          .join("")
      );
    case "languages":
      return `${title}<p class="plain">${content.languages.map((l) => `${esc(l.language)}${l.proficiency ? ` (${esc(l.proficiency)})` : ""}`).join(" · ")}</p>`;
    case "additional":
      return content.additionalSections
        .filter((s) => s.items.length > 0)
        .map(
          (s) =>
            `<h2>${esc(s.title)}</h2>` +
            s.items
              .map(
                (item) => `<div class="entry">
  <div class="when">${esc(item.date)}</div>
  <div class="what"><span class="title">${esc(item.title)}</span>${item.description ? ` <span class="org">&ndash; ${esc(item.description)}</span>` : ""}${item.url ? ` <span class="tech">${link(item.url)}</span>` : ""}</div>
</div>`,
              )
              .join(""),
        )
        .join("");
  }
}

export const engineeringModernTemplate: ResumeTemplate = {
  id: "engineering-modern",
  name: "Engineering Modern",
  description: "Modern minimalist layout with a date column. Suited to senior engineering and architecture roles.",
  render(content: ResumeContent, options: TemplateRenderOptions): string {
    const contacts = contactItems(content);
    const body = `
<header class="header">
  <div>
    <h1 class="name">${esc(content.personal.fullName)}</h1>
    ${content.personal.headline ? `<p class="headline">${esc(content.personal.headline)}</p>` : ""}
  </div>
  ${contacts.length ? `<div class="contact">${contacts.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}
</header>
${visibleSections(content)
  .map((key) => section(key, content))
  .join("\n")}`;
    return documentShell({ title: `${content.personal.fullName} - Resume`, css: CSS, body, options, margins: MARGINS });
  },
};
