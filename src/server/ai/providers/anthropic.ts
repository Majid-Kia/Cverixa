import Anthropic from "@anthropic-ai/sdk";
import { extractJsonObject, validateStructuredOutput, withTimeout } from "../json";
import {
  AIProviderError,
  type AIModel,
  type AIProvider,
  type ProviderStatus,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../types";

export interface AnthropicProviderOptions {
  apiKey: string | undefined;
  defaultTimeoutMs: number;
}

/**
 * Anthropic adapter. Structured output uses the native JSON-schema output
 * format; the result is still validated independently by the application.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  readonly displayName = "Anthropic";
  readonly paid = true;

  constructor(private readonly options: AnthropicProviderOptions) {}

  private client(timeoutMs = this.options.defaultTimeoutMs): Anthropic {
    if (!this.options.apiKey) {
      throw new AIProviderError("anthropic", "not_configured", "ANTHROPIC_API_KEY is not configured on the server.");
    }
    return new Anthropic({ apiKey: this.options.apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async listModels(): Promise<AIModel[]> {
    try {
      const page = await this.client().models.list({ limit: 100 });
      return page.data
        .map((model) => ({ id: model.id, displayName: model.display_name ?? model.id, supportsStructuredOutput: true }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }

  async checkConnection(): Promise<ProviderStatus> {
    if (!this.options.apiKey) {
      return { providerId: "anthropic", available: false, message: "API key not configured.", paid: true };
    }
    try {
      const models = await this.listModels();
      return { providerId: "anthropic", available: true, message: `${models.length} models available.`, paid: true };
    } catch (error) {
      return { providerId: "anthropic", available: false, message: normalizeAnthropicError(error).message, paid: true };
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs;
    const client = this.client(timeoutMs);
    const started = Date.now();
    try {
      const response: Anthropic.Message = await withTimeout(
        "anthropic",
        client.messages.create({
          model: request.modelId,
          max_tokens: request.maxOutputTokens ?? 8192,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: { format: { type: "json_schema", schema: request.jsonSchema } },
        }),
        timeoutMs,
      );
      if (response.stop_reason === "max_tokens") {
        throw new AIProviderError(
          "anthropic",
          "context_length",
          "The response was cut off because it exceeded the output limit.",
        );
      }
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text.trim()) {
        throw new AIProviderError(
          "anthropic",
          "invalid_response",
          "Anthropic did not return a structured result.",
          true,
        );
      }
      const data = validateStructuredOutput("anthropic", request.schema, extractJsonObject(text));
      return {
        data,
        modelId: response.model,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }
}

export function normalizeAnthropicError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIProviderError("anthropic", "timeout", "The request to Anthropic timed out.", true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AIProviderError("anthropic", "network", "Could not reach the Anthropic API.", true);
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    const message = typeof error.message === "string" ? error.message : "";
    if (status === 401 || status === 403) {
      return new AIProviderError("anthropic", "auth", "Anthropic rejected the configured API key.");
    }
    if (status === 429) {
      return new AIProviderError("anthropic", "rate_limit", "Anthropic rate limit exceeded. Try again later.", true);
    }
    if (status === 404) {
      return new AIProviderError("anthropic", "model_incompatible", "The selected Anthropic model was not found.");
    }
    if (status === 400 && /too long|context|tokens/i.test(message)) {
      return new AIProviderError(
        "anthropic",
        "context_length",
        "The input is too long for the selected Anthropic model.",
      );
    }
    if (status === 529 || (status && status >= 500)) {
      return new AIProviderError(
        "anthropic",
        "provider_error",
        "Anthropic is temporarily unavailable. Try again later.",
        true,
      );
    }
    return new AIProviderError("anthropic", "provider_error", `Anthropic request failed (${status ?? "unknown"}).`);
  }
  return new AIProviderError("anthropic", "unknown", "Unexpected error while calling Anthropic.");
}
