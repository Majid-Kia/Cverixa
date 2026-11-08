# ADR 0004: Provider adapters with application-side schema validation

Date: 2026-11-08 · Status: accepted

## Context

The product must work with OpenAI, Anthropic and local Ollama models, allow switching without touching business logic, never silently switch to a paid provider, and treat model output as untrusted.

## Decision

- A small `AIProvider` contract (`listModels`, `checkConnection`, `generateStructured`).
- Each adapter isolates its SDK, structured-output mechanism (OpenAI json_schema response format, Anthropic `output_config.format`, Ollama `format`), timeouts and error mapping into `AIProviderError` categories.
- The application converts Zod task schemas to JSON schema for the provider _and_ validates the returned data with the same Zod schema.
- Provider preferences (id, model, timeout) are stored per owner; API keys come only from environment variables and are displayed as configured/not configured.
- A deterministic `MockProvider` implements the same contract for tests, CI and offline demos; it is only registered when `AI_ENABLE_MOCK_PROVIDER=true`.
- The selected provider is shown before every generation; failures surface as errors with retry, never as a fallback to another vendor.

## Consequences

- Adding a provider is a single new adapter file plus registry entry.
- Model ids are configuration, documented as suggestions, and discoverable at runtime via "Load models".
- Ollama endpoints are validated (http/https only, no credentials, allow-list in production) to avoid SSRF-style misuse in hosted environments.
