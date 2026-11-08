import { NextResponse } from "next/server";
import { prisma } from "@/server/database/client";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for container orchestration. Never exposes private data. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
