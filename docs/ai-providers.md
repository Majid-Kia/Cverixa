# AI providers

Cverixa never depends on one vendor. Every AI task (`profile_import`, `job_analysis`, `resume_tailoring`) goes through the `AIProvider` contract in `src/server/ai/types.ts`:

```ts
interface AIProvider {
  id: "openai" | "anthropic" | "ollama" | "mock";
  paid: boolean;
  listModels(): Promise<AIModel[]>;
  checkConnection(): Promise<ProviderStatus>;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>;
}
```

`runStructuredTask` (src/server/ai/run-task.ts) converts the task's Zod schema to JSON schema, calls the selected adapter and logs only metadata. **Every response is validated with the Zod schema by the application**, regardless of what the provider promises (`validateStructuredOutput`).

## Adapters

| Provider  | SDK                                                 | Structured output mechanism                                  | Model listing                            |
| --------- | --------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| OpenAI    | `openai` (official)                                 | Chat Completions `response_format: json_schema` (non-strict) | `models.list()` filtered to `gpt-*`/`o*` |
| Anthropic | `@anthropic-ai/sdk` (official)                      | `output_config.format = { type: "json_schema" }`             | `models.list()`                          |
| Ollama    | `fetch` to `/api/chat` with `format: <json schema>` | Native JSON-schema format                                    | `/api/tags`                              |
| Mock      | none                                                | Deterministic handlers derived from the prompt data blocks   | fixed                                    |

Errors are normalised into `AIProviderError` categories: `not_configured`, `auth`, `rate_limit`, `timeout`, `network`, `context_length`, `model_incompatible`, `invalid_response`, `provider_error`, `unknown`. Messages are user-safe; nothing includes credentials or prompt content.

## Configuration

| Variable                  | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`          | Enables the OpenAI adapter                                                                   |
| `ANTHROPIC_API_KEY`       | Enables the Anthropic adapter                                                                |
| `OLLAMA_BASE_URL`         | Ollama endpoint reachable **from the application server** (default `http://localhost:11434`) |
| `OLLAMA_ALLOWED_HOSTS`    | Production only: comma-separated `host[:port]` allow-list; empty disables Ollama             |
| `AI_TIMEOUT_MS`           | Per-request timeout (default 120000)                                                         |
| `AI_ENABLE_MOCK_PROVIDER` | `true` exposes the deterministic mock provider (tests/demos only)                            |

Per-owner preferences (default provider, model id, optional timeout override) are stored in `AIProviderConfiguration` through the **AI Settings** page. The page shows whether a key is configured but never the key itself.

### Model identifiers

Model ids change over time. The settings page offers **Load models** to fetch the live list from the provider; the suggested starting points are documented defaults only:

- OpenAI: `gpt-5`, `gpt-4.1`, `gpt-4o`
- Anthropic: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`
- Ollama: whatever `ollama list` shows, for example `llama3.1`, `qwen2.5`, `mistral` (pull them first)

Small local models may produce invalid JSON; the application reports `invalid_response` and lets the user retry or choose another model.

## Cost and switching rules (PRD 15.4)

- Cloud providers are optional and billed by the vendor to the owner's account. The UI labels them "Paid usage" and states which provider/model will be used before each generation.
- Ollama (and the mock) run without external API charges.
- If the selected provider fails, the error is shown and the user may retry or pick another provider. The application never falls back to a different provider by itself.

## Ollama deployment constraints (PRD 15.5)

- Local development: the server reaches Ollama on the host (`http://localhost:11434`) or the `ollama` compose service (`http://ollama:11434`).
- Hosted/cloud deployment: a laptop's Ollama is not reachable. Run Ollama on a server the app can reach privately and add its host to `OLLAMA_ALLOWED_HOSTS`. Any endpoint not on the list is rejected in production; URLs with credentials or non-http(s) schemes are always rejected.
- Never expose Ollama to the public internet; put it on a private network and require TLS/auth at the network layer.

## Prompt hygiene

All untrusted inputs (resume text, job descriptions, profile JSON, user instructions) are wrapped in named data blocks (`src/server/ai/prompts/tags.ts`). Data-block tags inside the content are stripped. System prompts instruct the model to treat block contents as data only and never to invent facts. Independent of the model's behaviour, the claim validator removes any unsupported content (see docs/data-model.md, "Evidence tracking"). Tests in `tests/unit/prompt-injection.test.ts` cover a malicious job description that instructs the model to add a PhD, Java and Kubernetes experience.

## Adding a provider

1. Implement `AIProvider` in `src/server/ai/providers/<id>.ts`, isolating SDK-specific calls and error mapping.
2. Register it in `src/server/ai/registry.ts` (and in `AIProviderId`).
3. Add configuration hints and suggested models to `listProviderDefinitions`.
4. Add unit tests with a stubbed transport (see the Ollama tests for a `fetchImpl` example).

No resume business logic changes are required.
