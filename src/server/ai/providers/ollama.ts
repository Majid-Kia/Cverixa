import { extractJsonObject, validateStructuredOutput } from "../json";
import {
  AIProviderError,
  type AIModel,
  type AIProvider,
  type ProviderStatus,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../types";

export interface OllamaProviderOptions {
  baseUrl: string;
  defaultTimeoutMs: number;
  /** When true, only hosts in `allowedHosts` may be used (hosted deployments). */
  restrictHosts: boolean;
  allowedHosts: string[];
  fetchImpl?: typeof fetch;
}

/**
 * Validate an Ollama endpoint. Local development accepts any http(s) URL; in
 * production the host must be explicitly allow-listed (PRD 15.5).
 */
export function validateOllamaBaseUrl(
  baseUrl: string,
  options: { restrictHosts: boolean; allowedHosts: string[] },
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "Ollama base URL is not a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Ollama base URL must use http or https." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials in the Ollama URL are not supported." };
  }
  if (options.restrictHosts) {
    const host = url.host.toLowerCase();
    const allowed = options.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(host)) {
      return {
        ok: false,
        reason:
          "This Ollama endpoint is not in OLLAMA_ALLOWED_HOSTS. Hosted deployments must allow-list Ollama hosts explicitly.",
      };
    }
  }
  return { ok: true, url };
}

export class OllamaProvider implements AIProvider {
  readonly id = "ollama" as const;
  readonly displayName = "Ollama (local)";
  readonly paid = false;

  constructor(private readonly options: OllamaProviderOptions) {}

  private endpoint(path: string): string {
    const validation = validateOllamaBaseUrl(this.options.baseUrl, this.options);
    if (!validation.ok) {
      throw new AIProviderError("ollama", "not_configured", validation.reason);
    }
    const base = validation.url.toString().replace(/\/+$/, "");
    return `${base}${path}`;
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(this.endpoint(path), { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AIProviderError("ollama", "timeout", "The request to Ollama timed out.", true);
      }
      throw new AIProviderError("ollama", "network", "Could not reach the configured Ollama endpoint.", true);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 404 && /model|not found/i.test(body)) {
        throw new AIProviderError(
          "ollama",
          "model_incompatible",
          "The selected model is not available on the Ollama server. Pull it first.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AIProviderError("ollama", "auth", "The Ollama endpoint rejected the request.");
      }
      throw new AIProviderError(
        "ollama",
        "provider_error",
        `Ollama responded with status ${response.status}.`,
        response.status >= 500,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AIProviderError("ollama", "invalid_response", "Ollama returned a non-JSON response.", true);
    }
  }

  async listModels(): Promise<AIModel[]> {
    const data = await this.request<{ models?: Array<{ name: string }> }>("/api/tags", { method: "GET" }, 10_000);
    return (data.models ?? [])
      .map((model) => ({ id: model.name, displayName: model.name, supportsStructuredOutput: true }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async checkConnection(): Promise<ProviderStatus> {
    try {
      const models = await this.listModels();
      return {
        providerId: "ollama",
        available: true,
        message:
          models.length > 0 ? `${models.length} local models available.` : "Connected, but no models are pulled yet.",
        paid: false,
      };
    } catch (error) {
      const message = error instanceof AIProviderError ? error.message : "Could not reach Ollama.";
      return { providerId: "ollama", available: false, message, paid: false };
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs;
    const started = Date.now();
    const data = await this.request<{
      model?: string;
      message?: { content?: string };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    }>(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: request.modelId,
          stream: false,
          format: request.jsonSchema,
          options: { temperature: request.temperature ?? 0.2, num_predict: request.maxOutputTokens ?? -1 },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      },
      timeoutMs,
    );
    const content = data.message?.content ?? "";
    if (data.done_reason === "length") {
      throw new AIProviderError("ollama", "context_length", "The local model stopped before completing the response.");
    }
    const parsed = validateStructuredOutput("ollama", request.schema, extractJsonObject(content));
    return {
      data: parsed,
      modelId: data.model ?? request.modelId,
      usage: { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count },
      durationMs: Date.now() - started,
    };
  }
}
