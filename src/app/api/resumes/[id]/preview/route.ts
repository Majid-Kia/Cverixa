import { NextResponse, type NextRequest } from "next/server";
import { getLatestRevision, getRevision } from "@/features/resume-history/service";
import { renderResumeHtml } from "@/features/resume-rendering/render-html";
import { NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/security/session";
import { isTemplateId } from "@/templates";
import { pageFormatSchema, resumeContentSchema } from "@/types/resume-content";

export const dynamic = "force-dynamic";

const CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";

/** HTML preview of a saved version (GET) or of unsaved editor content (POST). Same templates as the PDF. */
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
    const html = renderResumeHtml(revision.content, { templateId, pageFormat, preview: true });
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": CSP,
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  try {
    await getLatestRevision(user.id, id); // ownership check
    const body = await request.json();
    const content = resumeContentSchema.parse(body.content);
    const templateId =
      typeof body.templateId === "string" && isTemplateId(body.templateId) ? body.templateId : "classic-clear";
    const pageFormat = pageFormatSchema.catch("A4").parse(body.pageFormat);
    const html = renderResumeHtml(content, { templateId, pageFormat, preview: true });
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": CSP,
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse("Not found", { status: 404 });
    return new NextResponse("Invalid content", { status: 400 });
  }
}
