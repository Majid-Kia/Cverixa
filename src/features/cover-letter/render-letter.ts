import type { PersonalInfo } from "@/features/career-profile/schema";
import { displayUrl, esc } from "@/templates/shared";
import type { PageFormat } from "@/types/resume-content";

/** Blank-line separated blocks of the letter; single line breaks inside a block are kept. */
export function letterBlocks(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Print HTML for a cover letter: the owner's name and contact line from the
 * confirmed profile, the date, then the letter exactly as saved. Every value
 * is escaped; fonts are embedded by the caller.
 */
export function renderCoverLetterHtml(input: {
  body: string;
  personal: PersonalInfo;
  date: string;
  pageFormat: PageFormat;
  fontFaceCss: string;
}): string {
  const { personal } = input;
  const contact = [
    personal.email,
    personal.phone,
    personal.location,
    personal.linkedinUrl ? displayUrl(personal.linkedinUrl) : "",
    personal.portfolioUrl ? displayUrl(personal.portfolioUrl) : "",
  ].filter((value) => value && value.trim());
  const blocks = letterBlocks(input.body)
    .map((block) => `<p>${block.split("\n").map(esc).join("<br>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(personal.fullName ? `${personal.fullName} - Cover letter` : "Cover letter")}</title>
<style>
${input.fontFaceCss}
@page { size: ${input.pageFormat === "Letter" ? "Letter" : "A4"}; margin: 22mm 22mm 20mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Inter", sans-serif; font-size: 10.5pt; line-height: 1.55; color: #111827; }
header { border-bottom: 1px solid #d1d5db; padding-bottom: 8pt; margin-bottom: 18pt; }
h1 { font-size: 16pt; font-weight: 600; margin: 0 0 3pt; }
.contact { font-size: 9pt; color: #4b5563; margin: 0; }
.date { margin: 0 0 14pt; color: #374151; }
p { margin: 0 0 10pt; overflow-wrap: anywhere; }
</style>
</head>
<body>
<header>
<h1>${esc(personal.fullName)}</h1>
${contact.length > 0 ? `<p class="contact">${contact.map(esc).join(" &middot; ")}</p>` : ""}
</header>
<p class="date">${esc(input.date)}</p>
${blocks}
</body>
</html>`;
}
