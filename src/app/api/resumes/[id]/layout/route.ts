import { NextResponse, type NextRequest } from "next/server";
import { getLatestRevision } from "@/features/resume-history/service";
import { exportResumePdf } from "@/features/resume-rendering/export-resume";
import { NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/security/session";
import { isTemplateId } from "@/templates";
import { pageFormatSchema, resumeContentSchema } from "@/types/resume-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * PDF check for the editor: renders the current (unsaved) content with
 * Chromium and returns the page count, layout warnings and the export quality
 * checks (nearly empty last page, repeated skill labels, headline
 * consistency, selected project on page one) without saving.
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
    const result = await exportResumePdf(content, { templateId, pageFormat });
    return NextResponse.json({
      pageCount: result.pageCount,
      warnings: [
        ...result.layoutWarnings.map((warning) => warning.message),
        ...result.validation.problems,
        ...result.qualityWarnings.map((warning) => warning.message),
      ],
      durationMs: result.durationMs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Layout check failed." }, { status: 500 });
  }
}
