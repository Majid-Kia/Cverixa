import { NextResponse, type NextRequest } from "next/server";
import { getLatestRevision } from "@/features/resume-history/service";
import { renderPdf } from "@/features/resume-rendering/pdf";
import { renderResumeHtml } from "@/features/resume-rendering/render-html";
import { validateResumePdf } from "@/features/resume-rendering/validate-pdf";
import { NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/security/session";
import { isTemplateId } from "@/templates";
import { pageFormatSchema, resumeContentSchema } from "@/types/resume-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Pagination check for the editor: renders the current (unsaved) content with
 * Chromium and returns the page count and layout warnings without saving.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    await getLatestRevision(user.id, id);
    const body = await request.json();
    const content = resumeContentSchema.parse(body.content);
    const templateId =
      typeof body.templateId === "string" && isTemplateId(body.templateId) ? body.templateId : "classic-clear";
    const pageFormat = pageFormatSchema.catch("A4").parse(body.pageFormat);
    const html = renderResumeHtml(content, { templateId, pageFormat });
    const rendered = await renderPdf(html, pageFormat);
    const validation = await validateResumePdf(rendered.pdf, { mustContain: [content.personal.fullName] });
    return NextResponse.json({
      pageCount: validation.pageCount,
      warnings: [...rendered.layoutWarnings.map((w) => w.message), ...validation.problems],
      durationMs: rendered.durationMs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Layout check failed." }, { status: 500 });
  }
}
