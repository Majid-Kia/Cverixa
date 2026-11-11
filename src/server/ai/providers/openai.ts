import OpenAI from "openai";
import { extractJsonObject, validateStructuredOutput, withTimeout } from "../json";
import {
  AIProviderError,
  type AIModel,
  type AIProvider,
  type ProviderStatus,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../types";

export interface OpenAIProviderOptions {
  apiKey: string | undefined;
  defaultTimeoutMs: number;
}

/** Models known to support JSON-schema structured output. Others may still work via JSON mode. */
const STRUCTURED_MODEL_PATTERN = /^(gpt-4o|gpt-4\.1|gpt-5|o[1-9])/;

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly displayName = "OpenAI";
  readonly paid = true;

  constructor(private readonly options: OpenAIProviderOptions) {}

  private client(timeoutMs = this.options.defaultTimeoutMs): OpenAI {
    if (!this.options.apiKey) {
      throw new AIProviderError("openai", "not_configured", "OPENAI_API_KEY is not configured on the server.");
    }
    return new OpenAI({ apiKey: this.options.apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async listModels(): Promise<AIModel[]> {
    try {
      const page = await this.client().models.list();
      const models: AIModel[] = [];
      for await (const model of page) {
        if (!/^(gpt|o[1-9])/.test(model.id)) continue;
        models.push({
          id: model.id,
          displayName: model.id,
          supportsStructuredOutput: STRUCTURED_MODEL_PATTERN.test(model.id),
        });
      }
      return models.sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }

  async checkConnection(): Promise<ProviderStatus> {
    if (!this.options.apiKey) {
      return { providerId: "openai", available: false, message: "API key not configured.", paid: true };
    }
    try {
      const models = await this.listModels();
      return { providerId: "openai", available: true, message: `${models.length} models available.`, paid: true };
    } catch (error) {
      const normalized = normalizeOpenAIError(error);
      return { providerId: "openai", available: false, message: normalized.message, paid: true };
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs;
    const client = this.client(timeoutMs);
    const started = Date.now();
    try {
      const completion = await withTimeout(
        "openai",
        client.chat.completions.create({
          model: request.modelId,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.task, schema: request.jsonSchema, strict: false },
          },
          max_completion_tokens: request.maxOutputTokens,
        }),
        timeoutMs,
      );
      const choice = completion.choices[0];
      if (!choice?.message?.content) {
        throw new AIProviderError("openai", "invalid_response", "OpenAI returned an empty response.", true);
      }
      if (choice.finish_reason === "length") {
        throw new AIProviderError(
          "openai",
          "context_length",
          "The response was cut off because it exceeded the output limit.",
          false,
        );
      }
      const data = validateStructuredOutput("openai", request.schema, extractJsonObject(choice.message.content));
      return {
        data,
        modelId: completion.model ?? request.modelId,
        usage: { inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens },
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }
}

export function normalizeOpenAIError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIProviderError("openai", "timeout", "The request to OpenAI timed out.", true);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AIProviderError("openai", "network", "Could not reach the OpenAI API.", true);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const message = typeof error.message === "string" ? error.message : "";
    if (status === 401 || status === 403) {
      return new AIProviderError("openai", "auth", "OpenAI rejected the configured API key.");
    }
    if (status === 429) {
      if (error.type === "insufficient_quota" || error.code === "insufficient_quota") {
        return new AIProviderError(
          "openai",
          "rate_limit",
          "OpenAI API quota exhausted. Check your API billing and usage limits.",
        );
      }
      return new AIProviderError("openai", "rate_limit", "OpenAI rate limit reached. Try again later.", true);
    }
    if (status === 404) {
      return new AIProviderError(
        "openai",
        "model_incompatible",
        "The selected OpenAI model is not available for this account.",
      );
    }
    if (status === 400 && /context|too long|maximum/i.test(message)) {
      return new AIProviderError("openai", "context_length", "The input is too long for the selected OpenAI model.");
    }
    if (status === 400 && /response_format|json_schema|unsupported/i.test(message)) {
      return new AIProviderError(
        "openai",
        "model_incompatible",
        "The selected OpenAI model does not support structured JSON output.",
      );
    }
    if (status && status >= 500) {
      return new AIProviderError("openai", "provider_error", "OpenAI reported a server error. Try again later.", true);
    }
    return new AIProviderError("openai", "provider_error", `OpenAI request failed (${status ?? "unknown"}).`);
  }
  return new AIProviderError("openai", "unknown", "Unexpected error while calling OpenAI.");
}
