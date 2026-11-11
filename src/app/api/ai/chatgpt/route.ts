import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  chatgptAttemptCookie,
  chatgptOrigin,
  disconnectChatGPT,
  startChatGPTSignIn,
} from "@/server/ai/chatgpt/session";
import { getProvider } from "@/server/ai/registry";
import { toProviderJsonSchema } from "@/server/ai/json";
import { getCurrentUser } from "@/server/security/session";

export async function POST(request: NextRequest) {
  const origin = chatgptOrigin();
  if (!origin || request.headers.get("host") !== new URL(origin).host || request.headers.get("origin") !== origin) {
    return new Response("Open AI Settings using the configured local 127.0.0.1 address.", { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const settings = new URL("/settings", origin);
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === "connect") {
      const attempt = startChatGPTSignIn(user.id);
      const response = NextResponse.redirect(attempt.url, 303);
      response.cookies.set(chatgptAttemptCookie, attempt.state, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: attempt.maxAge,
      });
      return response;
    }
    if (intent === "disconnect") {
      settings.searchParams.set("chatgpt", (await disconnectChatGPT()) ? "disconnected" : "local_disconnect");
    } else if (intent === "test") {
      const provider = getProvider("chatgpt");
      const [model] = await provider.listModels();
      if (!model) throw new Error("No models");
      const schema = z.object({ rewritten: z.string().trim().min(1) });
      await provider.generateStructured({
        task: "connection_test",
        modelId: model.id,
        system: "Rewrite the supplied fictional resume bullet concisely and preserve its facts.",
        user: "I built a Node.js tool that reduced inventory reporting time by 30%.",
        schema,
        jsonSchema: toProviderJsonSchema(schema),
      });
      settings.searchParams.set("chatgpt", "tested");
    } else {
      return new Response("Unknown action", { status: 400 });
    }
  } catch {
    settings.searchParams.set("chatgpt", intent === "test" ? "test_failed" : "failed");
  }
  return NextResponse.redirect(settings, 303);
}
