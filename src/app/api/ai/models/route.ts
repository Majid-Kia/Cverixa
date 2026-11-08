import { NextResponse, type NextRequest } from "next/server";
import { listProviderModels } from "@/features/ai-settings/service";
import { AIProviderError } from "@/server/ai/types";
import { getCurrentUser } from "@/server/security/session";

export const dynamic = "force-dynamic";

/** List models exposed by a provider (server-side; credentials never leave the server). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const providerId = request.nextUrl.searchParams.get("provider") ?? "";
  try {
    const models = await listProviderModels(providerId);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof AIProviderError ? error.message : "Could not list models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
