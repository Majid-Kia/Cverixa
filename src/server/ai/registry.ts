import "server-only";
import { getEnv, isProduction } from "@/lib/env";
import { AnthropicProvider } from "./providers/anthropic";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { AIProviderError, type AIProvider, type AIProviderId } from "./types";

export interface ProviderDefinition {
  id: AIProviderId;
  displayName: string;
  paid: boolean;
  /** Whether the server has the configuration needed to attempt a call. */
  configured: boolean;
  configurationHint: string;
  /** Documented starting-point model ids; the live list comes from the provider. */
  suggestedModels: string[];
}

// Keep provider instances with their module so route handlers and server actions
// use the same error constructors as their callers.
let aiProviders: Map<AIProviderId, AIProvider> | undefined;

function buildProviders(): Map<AIProviderId, AIProvider> {
  const env = getEnv();
  const map = new Map<AIProviderId, AIProvider>();
  map.set("openai", new OpenAIProvider({ apiKey: env.OPENAI_API_KEY, defaultTimeoutMs: env.AI_TIMEOUT_MS }));
  map.set("anthropic", new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, defaultTimeoutMs: env.AI_TIMEOUT_MS }));
  map.set(
    "ollama",
    new OllamaProvider({
      baseUrl: env.OLLAMA_BASE_URL,
      defaultTimeoutMs: env.AI_TIMEOUT_MS,
      restrictHosts: isProduction(),
      allowedHosts: env.OLLAMA_ALLOWED_HOSTS.split(",")
        .map((host) => host.trim())
        .filter(Boolean),
    }),
  );
  if (env.AI_ENABLE_MOCK_PROVIDER) {
    map.set("mock", new MockProvider());
  }
  return map;
}

function providers(): Map<AIProviderId, AIProvider> {
  return (aiProviders ??= buildProviders());
}

export function listProviderDefinitions(): ProviderDefinition[] {
  const env = getEnv();
  const definitions: ProviderDefinition[] = [
    {
      id: "openai",
      displayName: "OpenAI",
      paid: true,
      configured: Boolean(env.OPENAI_API_KEY),
      configurationHint: "Set OPENAI_API_KEY on the server.",
      suggestedModels: ["gpt-5", "gpt-4.1", "gpt-4o"],
    },
    {
      id: "anthropic",
      displayName: "Anthropic",
      paid: true,
      configured: Boolean(env.ANTHROPIC_API_KEY),
      configurationHint: "Set ANTHROPIC_API_KEY on the server.",
      suggestedModels: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    },
    {
      id: "ollama",
      displayName: "Ollama (local)",
      paid: false,
      configured: true,
      configurationHint: isProduction()
        ? "Set OLLAMA_BASE_URL and add its host to OLLAMA_ALLOWED_HOSTS."
        : "Run Ollama locally and set OLLAMA_BASE_URL (default http://localhost:11434).",
      suggestedModels: ["llama3.1", "qwen2.5", "mistral"],
    },
  ];
  if (env.AI_ENABLE_MOCK_PROVIDER) {
    definitions.push({
      id: "mock",
      displayName: "Mock (testing)",
      paid: false,
      configured: true,
      configurationHint: "Enabled by AI_ENABLE_MOCK_PROVIDER. Deterministic, for tests and demos only.",
      suggestedModels: ["mock-deterministic-v1"],
    });
  }
  return definitions;
}

export function isProviderId(value: string): value is AIProviderId {
  return value === "openai" || value === "anthropic" || value === "ollama" || value === "mock";
}

export function getProvider(id: string): AIProvider {
  if (!isProviderId(id)) {
    throw new AIProviderError("mock", "not_configured", `Unknown AI provider "${id}".`);
  }
  const provider = providers().get(id);
  if (!provider) {
    throw new AIProviderError(id, "not_configured", `AI provider "${id}" is not enabled on this server.`);
  }
  return provider;
}

/** Test hook: replace the registry (used by integration tests with a custom mock). */
export function __setProvidersForTests(map: Map<AIProviderId, AIProvider> | undefined) {
  aiProviders = map;
}
