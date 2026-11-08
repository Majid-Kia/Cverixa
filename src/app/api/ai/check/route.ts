import { NextResponse, type NextRequest } from "next/server";
import { checkProviderConnection } from "@/features/ai-settings/service";
import { AIProviderError } from "@/server/ai/types";
import { getCurrentUser } from "@/server/security/session";

export const dynamic = "force-dynamic";

/** Verify connectivity to a provider. Returns only non-sensitive status text. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const providerId = request.nextUrl.searchParams.get("provider") ?? "";
  try {
    const status = await checkProviderConnection(providerId);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Connection check failed.";
    return NextResponse.json({ providerId, available: false, message, paid: false });
  }
}
