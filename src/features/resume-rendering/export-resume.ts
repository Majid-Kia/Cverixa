import type { PageFormat, ResumeContent } from "@/types/resume-content";
import { checkExportQuality, type QualityWarning } from "./content-checks";
import { renderPdf, type LayoutWarning } from "./pdf";
import { renderResumeHtml } from "./render-html";
import { validateResumePdf, type PdfValidationResult } from "./validate-pdf";

export interface ExportResult {
  pdf: Uint8Array;
  pageCount: number;
  layoutWarnings: LayoutWarning[];
  validation: PdfValidationResult;
  /**
   * Findings about the finished PDF that the owner should look at: a nearly
   * empty last page, repeated skill labels, a headline that contradicts the
   * profile, a selected project that slipped off page one. They never block
   * the download.
   */
  qualityWarnings: QualityWarning[];
  durationMs: number;
}

/**
 * Authoritative server-side export pipeline (NFR-002): template HTML with
 * bundled Inter -> Chromium PDF -> structure and text validation -> quality
 * checks on the rendered pages.
 */
export async function exportResumePdf(
  content: ResumeContent,
  options: { templateId: string; pageFormat: PageFormat },
): Promise<ExportResult> {
  const html = renderResumeHtml(content, { templateId: options.templateId, pageFormat: options.pageFormat });
  const rendered = await renderPdf(html, options.pageFormat);
  const validation = await validateResumePdf(rendered.pdf, { mustContain: [content.personal.fullName] });
  return {
    pdf: rendered.pdf,
    pageCount: validation.pageCount,
    layoutWarnings: rendered.layoutWarnings,
    validation,
    qualityWarnings: checkExportQuality(content, validation.pages),
    durationMs: rendered.durationMs,
  };
}
