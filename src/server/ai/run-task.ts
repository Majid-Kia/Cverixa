import "server-only";
import type { ZodType } from "zod";
import { logger } from "@/lib/logger";
import { toProviderJsonSchema } from "./json";
import { getProvider } from "./registry";
import { AIProviderError, type StructuredGenerationResult } from "./types";

export interface RunTaskInput<T> {
  task: "job_analysis" | "resume_tailoring" | "profile_import";
  providerId: string;
  modelId: string;
  schema: ZodType<T>;
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Execute a structured AI task through the selected provider. Logs only safe
 * metadata (task, provider, model, duration, error category) and never the
 * prompt or response content.
 */
export async function runStructuredTask<T>(input: RunTaskInput<T>): Promise<StructuredGenerationResult<T>> {
  const provider = getProvider(input.providerId);
  const started = Date.now();
  try {
    const result = await provider.generateStructured<T>({
      task: input.task,
      modelId: input.modelId,
      schema: input.schema,
      jsonSchema: toProviderJsonSchema(input.schema),
      system: input.system,
      user: input.user,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
    });
    logger.info("ai.task.completed", {
      task: input.task,
      provider: provider.id,
      model: result.modelId,
      durationMs: Date.now() - started,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    });
    return result;
  } catch (error) {
    const category = error instanceof AIProviderError ? error.category : "unknown";
    logger.warn("ai.task.failed", {
      task: input.task,
      provider: provider.id,
      model: input.modelId,
      durationMs: Date.now() - started,
      category,
    });
    throw error;
  }
}
