import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { ChatGPTProvider } from "@/server/ai/providers/chatgpt";

vi.mock("@/server/ai/chatgpt/session", () => ({
  chatgptResource: "https://api.openai.com/v1",
  getChatGPTAccessToken: async () => "test-oauth-token",
}));

const request = {
  task: "connection_test",
  modelId: "test-model",
  system: "Preserve the source facts.",
  user: "Fictional experience.",
  schema: z.object({ rewritten: z.string() }),
  jsonSchema: { type: "object", properties: { rewritten: { type: "string" } } },
  maxOutputTokens: 100,
  temperature: 0,
};

function eventStream(event: object) {
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => vi.unstubAllGlobals());

it("uses the OAuth token and supported streaming parameters, then validates the completed output", async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-oauth-token");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ store: false, stream: true, instructions: request.system });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_output_tokens");
    return eventStream({
      type: "response.completed",
      response: {
        model: "test-model",
        output: [{ type: "message", content: [{ type: "output_text", text: '{"rewritten":"Fictional rewrite."}' }] }],
      },
    });
  });
  vi.stubGlobal("fetch", fetch);
  await expect(new ChatGPTProvider(5_000).generateStructured(request)).resolves.toMatchObject({
    data: { rewritten: "Fictional rewrite." },
  });
  expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.anything());
});

it("reports a plan usage limit received during streaming", async () => {
  vi.stubGlobal("fetch", async () =>
    eventStream({
      type: "response.failed",
      response: { error: { code: "subscription_sharing_usage_limit_exceeded" } },
    }),
  );
  await expect(new ChatGPTProvider(5_000).generateStructured(request)).rejects.toMatchObject({
    category: "rate_limit",
  });
});
