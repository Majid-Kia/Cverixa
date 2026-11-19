import { NextResponse, type NextRequest } from "next/server";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { renderCoverLetterHtml } from "@/features/cover-letter/render-letter";
import { getCoverLetter } from "@/features/cover-letter/service";
import { getJobDescription } from "@/features/job-analysis/service";
import { interFontFaceCss } from "@/features/resume-rendering/fonts";
import { renderPdf } from "@/features/resume-rendering/pdf";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/server/security/session";
import { pageFormatSchema } from "@/types/resume-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** PDF of the saved cover letter: the owner's contact header, today's date and the letter as written. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  try {
    const letter = await getCoverLetter(user.id, id);
    const [profile, job] = await Promise.all([
      getProfileSnapshot(user.id),
      getJobDescription(user.id, letter.jobDescriptionId),
    ]);
    const pageFormat = pageFormatSchema.catch("A4").parse(request.nextUrl.searchParams.get("format") ?? "A4");
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const html = renderCoverLetterHtml({
      body: letter.body,
      personal: profile.data.personal,
      date,
      pageFormat,
      fontFaceCss: interFontFaceCss(),
    });
    const rendered = await renderPdf(html, pageFormat);
    logger.info("cover_letter.exported", { coverLetterId: id, durationMs: rendered.durationMs });
    const safeName = [profile.data.personal.fullName || "cover-letter", "cover-letter", job.company]
      .filter(Boolean)
      .join("-")
      .replace(/[^\w.-]+/g, "_");
    return new NextResponse(Buffer.from(rendered.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeName}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse("Not found", { status: 404 });
    logger.error("cover_letter.export_failed", {
      coverLetterId: id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "PDF rendering failed. Check that Chromium is installed on the server." },
      { status: 500 },
    );
  }
}
