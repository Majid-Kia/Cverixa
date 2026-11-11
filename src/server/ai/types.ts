import type { ZodType } from "zod";

export type AIProviderId = "openai" | "anthropic" | "ollama" | "mock" | "chatgpt";

export interface AIModel {
  id: string;
  displayName: string;
  /** Whether the provider reports structured JSON output support for this model. */
  supportsStructuredOutput: boolean;
}

export interface ProviderStatus {
  providerId: AIProviderId;
  available: boolean;
  /** Human-readable reason when unavailable (never includes secrets). */
  message: string;
  /** Whether using this provider may incur third-party usage charges. */
  paid: boolean;
}

export interface StructuredGenerationRequest<T> {
  /** Short identifier used for logging and for the mock provider. */
  task: string;
  modelId: string;
  schema: ZodType<T>;
  /** JSON schema derived from `schema`, passed to providers that accept one. */
  jsonSchema: Record<string, unknown>;
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  modelId: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  durationMs: number;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly displayName: string;
  /** Whether using the provider may incur usage charges. */
  readonly paid: boolean;
  listModels(): Promise<AIModel[]>;
  checkConnection(): Promise<ProviderStatus>;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>;
}

export type AIErrorCategory =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "context_length"
  | "model_incompatible"
  | "invalid_response"
  | "provider_error"
  | "unknown";

/** Normalized provider error. The message is safe to show to the user. */
export class AIProviderError extends Error {
  constructor(
    readonly providerId: AIProviderId,
    readonly category: AIErrorCategory,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
