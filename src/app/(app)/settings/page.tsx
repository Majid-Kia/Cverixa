import type { Metadata } from "next";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { getEnv, isProduction } from "@/lib/env";
import { requireUser } from "@/server/security/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "AI Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getAISettings(user.id);
  const env = getEnv();
  return (
    <>
      <PageHeader
        title="AI Provider Settings"
        description="Choose which provider and model Cverixa uses for import, job analysis and tailoring. API keys are read from server environment variables and are never shown or stored here."
      />
      <Alert tone="info" className="mb-6">
        Cloud providers (OpenAI, Anthropic) may incur usage charges on your own account. Ollama runs locally with no
        external API cost. Cverixa never switches providers without your explicit selection.
      </Alert>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <SettingsForm
          definitions={settings.definitions}
          settings={settings.settings.map((setting) => ({ ...setting, updatedAt: setting.updatedAt.toISOString() }))}
          defaultProviderId={settings.defaultProviderId}
        />
        <Card>
          <CardTitle>Server configuration</CardTitle>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">OpenAI API key</dt>
              <dd className="text-muted">{env.OPENAI_API_KEY ? "configured (hidden)" : "not configured"}</dd>
            </div>
            <div>
              <dt className="font-medium">Anthropic API key</dt>
              <dd className="text-muted">{env.ANTHROPIC_API_KEY ? "configured (hidden)" : "not configured"}</dd>
            </div>
            <div>
              <dt className="font-medium">Ollama endpoint</dt>
              <dd className="text-muted">
                {env.OLLAMA_BASE_URL}
                {isProduction()
                  ? ` · allowed hosts: ${env.OLLAMA_ALLOWED_HOSTS || "(none, Ollama disabled)"}`
                  : " · local development: any host allowed"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Request timeout</dt>
              <dd className="text-muted">{env.AI_TIMEOUT_MS} ms (AI_TIMEOUT_MS)</dd>
            </div>
          </dl>
          <p className="text-muted mt-4 text-xs">
            Change these values in the server environment (.env) and restart the application. See docs/ai-providers.md.
          </p>
        </Card>
      </div>
    </>
  );
}
