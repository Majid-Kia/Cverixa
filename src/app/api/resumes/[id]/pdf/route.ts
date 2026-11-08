import { NextResponse, type NextRequest } from "next/server";
import { getLatestRevision, getRevision } from "@/features/resume-history/service";
import { exportResumePdf } from "@/features/resume-rendering/export-resume";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/server/security/session";
import { isTemplateId } from "@/templates";
import { pageFormatSchema } from "@/types/resume-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Authoritative PDF export of a saved version. Validated for text extraction and font embedding before download. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const revisionId = request.nextUrl.searchParams.get("revision");
  try {
    const revision = revisionId ? await getRevision(user.id, revisionId) : await getLatestRevision(user.id, id);
    if (revision.resumeId !== id) return new NextResponse("Not found", { status: 404 });
    const templateParam = request.nextUrl.searchParams.get("template");
    const templateId = templateParam && isTemplateId(templateParam) ? templateParam : revision.templateId;
    const pageFormat = pageFormatSchema
      .catch(revision.pageFormat)
      .parse(request.nextUrl.searchParams.get("format") ?? revision.pageFormat);
    const result = await exportResumePdf(revision.content, { templateId, pageFormat });
    if (!result.validation.ok) {
      logger.error("pdf.validation_failed", {
        resumeId: id,
        revisionId: revision.id,
        problems: result.validation.problems.join(" | "),
      });
      return NextResponse.json(
        { error: "The generated PDF failed validation.", problems: result.validation.problems },
        { status: 500 },
      );
    }
    logger.info("pdf.exported", {
      resumeId: id,
      revisionId: revision.id,
      template: templateId,
      pages: result.pageCount,
      durationMs: result.durationMs,
    });
    const safeName = `${revision.content.personal.fullName || "resume"}-v${revision.version}`.replace(/[^\w.-]+/g, "_");
    return new NextResponse(Buffer.from(result.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeName}.pdf"`,
        "cache-control": "private, no-store",
        "x-resume-pages": String(result.pageCount),
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse("Not found", { status: 404 });
    logger.error("pdf.export_failed", { resumeId: id, error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json(
      { error: "PDF rendering failed. Check that Chromium is installed on the server." },
      { status: 500 },
    );
  }
}
