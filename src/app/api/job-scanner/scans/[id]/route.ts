import { NextResponse } from "next/server";
import { getScan } from "@/features/job-scanner/scan-service";
import { NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/security/session";

export const dynamic = "force-dynamic";

/** Progress of one scan, polled by the Job Scanner page while a scan runs. Owner only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const scan = await getScan(user.id, id);
    return NextResponse.json({
      id: scan.id,
      status: scan.status,
      progress: scan.progress,
      discoveredCount: scan.discoveredCount,
      newCount: scan.newCount,
      duplicateCount: scan.duplicateCount,
      analyzedCount: scan.analyzedCount,
      errorSummary: scan.errorSummary,
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
