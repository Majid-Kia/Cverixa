import { getTemplate } from "@/templates";
import { resumeContentSchema, type PageFormat, type ResumeContent } from "@/types/resume-content";
import { interFontFaceCss } from "./fonts";

export interface RenderHtmlOptions {
  templateId: string;
  pageFormat: PageFormat;
  /** Preview mode wraps the document in an on-screen page frame. */
  preview?: boolean;
}

/**
 * Deterministic HTML rendering: validated content + template + bundled fonts.
 * No AI involvement, no network access (PRD 5.4, NFR-002).
 */
export function renderResumeHtml(content: ResumeContent, options: RenderHtmlOptions): string {
  const validated = resumeContentSchema.parse(content);
  const template = getTemplate(options.templateId);
  return template.render(validated, {
    pageFormat: options.pageFormat,
    fontFaceCss: interFontFaceCss(),
    preview: options.preview,
  });
}
