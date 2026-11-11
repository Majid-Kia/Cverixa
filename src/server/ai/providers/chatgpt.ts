import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { chatgptResource, getChatGPTAccessToken } from "../chatgpt/session";
import { extractJsonObject, validateStructuredOutput } from "../json";
import {
  AIProviderError,
  type AIModel,
  type AIProvider,
  type ProviderStatus,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../types";

const modelCatalog = z.object({
  models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })),
});

function inferenceError(code: string | undefined, status?: number) {
  if (code === "subscription_sharing_usage_limit_exceeded" || status === 429) {
    return new AIProviderError(
      "chatgpt",
      "rate_limit",
      "ChatGPT plan usage limit reached. Check usage in ChatGPT settings.",
    );
  }
  if (code === "subscription_sharing_usage_unavailable" || status === 401 || status === 403) {
    return new AIProviderError(
      "chatgpt",
      "auth",
      "ChatGPT plan usage is unavailable. Check the connected account and permissions.",
    );
  }
  if (status === 404) {
    return new AIProviderError(
      "chatgpt",
      "model_incompatible",
      "The selected model is unavailable. Load models in AI Settings.",
    );
  }
  return new AIProviderError("chatgpt", "provider_error", "ChatGPT did not complete the request. Try again.");
}

export class ChatGPTProvider implements AIProvider {
  readonly id = "chatgpt" as const;
  readonly displayName = "ChatGPT plan";
  readonly paid = false;

  constructor(private readonly timeoutMs: number) {}

  async listModels(): Promise<AIModel[]> {
    try {
      const response = await fetch(`${chatgptResource}/models`, {
        headers: { authorization: `Bearer ${await getChatGPTAccessToken()}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw inferenceError(undefined, response.status);
      return modelCatalog
        .parse(await response.json())
        .models.filter((model) => model.visibility === "list")
        .map((model) => ({ id: model.slug, displayName: model.display_name, supportsStructuredOutput: true }));
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError("chatgpt", "network", "Could not load the connected ChatGPT account’s models.", true);
    }
  }

  async checkConnection(): Promise<ProviderStatus> {
    const models = await this.listModels();
    return {
      providerId: this.id,
      available: models.length > 0,
      paid: this.paid,
      message: models.length
        ? `Connected to your ChatGPT plan. ${models.length} models available.`
        : "No models are available for this ChatGPT account.",
    };
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    const timeout = request.timeoutMs ?? this.timeoutMs;
    try {
      const client = new OpenAI({
        baseURL: chatgptResource,
        apiKey: await getChatGPTAccessToken(),
        organization: null,
        project: null,
        timeout,
        maxRetries: 0,
        logLevel: "off",
      });
      const stream = await client.responses.create(
        {
          model: request.modelId,
          instructions: request.system,
          input: [{ role: "user", content: request.user }],
          store: false,
          stream: true,
          text: { format: { type: "json_schema", name: request.task, schema: request.jsonSchema, strict: false } },
        },
        { signal: AbortSignal.timeout(timeout) },
      );
      for await (const event of stream) {
        if (event.type === "response.failed") throw inferenceError(event.response.error?.code);
        if (event.type === "error") throw inferenceError(event.code ?? undefined);
        if (event.type === "response.incomplete") {
          throw new AIProviderError("chatgpt", "invalid_response", "ChatGPT returned an incomplete response.", true);
        }
        if (event.type !== "response.completed") continue;
        const response = event.response;
        const text = response.output
          .flatMap((item) =>
            item.type === "message"
              ? item.content.flatMap((part) => (part.type === "output_text" ? [part.text] : []))
              : [],
          )
          .join("");
        return {
          data: validateStructuredOutput(this.id, request.schema, extractJsonObject(text)),
          modelId: response.model,
          usage: { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
          durationMs: Date.now() - started,
        };
      }
      throw new AIProviderError("chatgpt", "invalid_response", "ChatGPT’s response ended early.", true);
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (
        error instanceof OpenAI.APIConnectionTimeoutError ||
        (error instanceof Error && ["AbortError", "TimeoutError", "APIUserAbortError"].includes(error.name))
      ) {
        throw new AIProviderError("chatgpt", "timeout", "The request to ChatGPT timed out.", true);
      }
      if (error instanceof OpenAI.APIError) throw inferenceError(error.code ?? undefined, error.status);
      throw new AIProviderError("chatgpt", "network", "Could not reach ChatGPT.", true);
    }
  }
}
