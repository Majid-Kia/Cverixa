import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_ALLOWED_HOSTS: z.string().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  AI_ENABLE_MOCK_PROVIDER: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  IMPORT_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  IMPORT_MAX_PAGES: z.coerce.number().int().positive().default(10),
  CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

/**
 * Validated server environment. Throws a readable error on first access when
 * required variables are missing so misconfiguration fails fast.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    ...process.env,
    OPENAI_API_KEY: emptyToUndefined(process.env.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: emptyToUndefined(process.env.ANTHROPIC_API_KEY),
    CHROMIUM_EXECUTABLE_PATH: emptyToUndefined(process.env.CHROMIUM_EXECUTABLE_PATH),
    OLLAMA_ALLOWED_HOSTS: process.env.OLLAMA_ALLOWED_HOSTS ?? "",
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
