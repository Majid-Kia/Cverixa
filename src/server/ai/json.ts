import { z, type ZodType } from "zod";
import { AIProviderError, type AIProviderId } from "./types";

/** Convert a Zod schema into a JSON schema accepted by provider structured-output APIs. */
export function toProviderJsonSchema(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Extract a JSON object from free-form model output. Handles code fences and
 * leading/trailing prose. Returns null when nothing parseable is found.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(trimmed);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Validate untrusted provider output against the task schema. Every provider
 * goes through this regardless of its own structured-output guarantees.
 */
export function validateStructuredOutput<T>(providerId: AIProviderId, schema: ZodType<T>, raw: unknown): T {
  if (raw === null || raw === undefined) {
    throw new AIProviderError(providerId, "invalid_response", "The model returned no parseable JSON.", true);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new AIProviderError(
      providerId,
      "invalid_response",
      `The model response did not match the expected structure (${detail}).`,
      true,
    );
  }
  return result.data;
}

/** Wrap a promise with a timeout that raises a normalized timeout error. */
export async function withTimeout<T>(providerId: AIProviderId, promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AIProviderError(
            providerId,
            "timeout",
            `The request to ${providerId} timed out after ${Math.round(timeoutMs / 1000)}s.`,
            true,
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
