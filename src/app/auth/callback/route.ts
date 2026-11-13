import { NextResponse, type NextRequest } from "next/server";
import { chatgptAttemptCookie, chatgptOrigin, finishChatGPTSignIn } from "@/server/ai/chatgpt/session";
import { getCurrentUser } from "@/server/security/session";

export async function GET(request: NextRequest) {
  const origin = chatgptOrigin();
  if (!origin || request.headers.get("host") !== new URL(origin).host) {
    return new Response("Invalid callback address", { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return new Response("Sign into Cverixa and try connecting again.", { status: 401 });
  const result = await finishChatGPTSignIn(
    user.id,
    request.cookies.get(chatgptAttemptCookie)?.value,
    request.nextUrl.searchParams,
  );
  const settings = new URL("/settings", origin);
  settings.searchParams.set("chatgpt", result);
  const response = NextResponse.redirect(settings, 303);
  response.cookies.delete(chatgptAttemptCookie);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
