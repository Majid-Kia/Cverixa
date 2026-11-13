import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { getEnv, isProduction } from "@/lib/env";
import { chatgptConnection, chatgptOrigin } from "@/server/ai/chatgpt/session";
import { requireUser } from "@/server/security/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "AI Settings" };
export const dynamic = "force-dynamic";

const chatgptMessages: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  connected: { tone: "success", text: "ChatGPT plan connected. Test a rewrite before selecting a model." },
  tested: { tone: "success", text: "A fictional resume bullet was successfully rewritten using your ChatGPT plan." },
  disconnected: { tone: "success", text: "ChatGPT plan disconnected." },
  local_disconnect: {
    tone: "warning",
    text: "Disconnected locally. Open ChatGPT settings to confirm that access was revoked.",
  },
  denied: { tone: "warning", text: "Sign-in was cancelled or permission was declined." },
  invalid: { tone: "danger", text: "The sign-in attempt expired or could not be verified. Start again here." },
  failed: {
    tone: "danger",
    text: "Could not verify the ChatGPT connection. Check that you allowed plan usage and try again.",
  },
  test_failed: {
    tone: "danger",
    text: "The test rewrite failed. Check your connected account, models, and plan usage.",
  },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ chatgpt?: string }> }) {
  const user = await requireUser();
  const settings = await getAISettings(user.id);
  const env = getEnv();
  const localOrigin = chatgptOrigin();
  const connection = chatgptConnection();
  const result = (await searchParams).chatgpt;
  const message = result && Object.hasOwn(chatgptMessages, result) ? chatgptMessages[result] : undefined;
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
      {localOrigin ? (
        <Card className="mb-6">
          <CardTitle>Connect your ChatGPT plan</CardTitle>
          <p className="text-muted mb-3 text-sm">
            {connection.connected
              ? `Using ChatGPT plan${connection.email ? ` · ${connection.email}` : ""}.`
              : "Sign in to allow Cverixa to use your existing ChatGPT allowance."}
          </p>
          {message ? (
            <Alert tone={message.tone} className="mb-3">
              {message.text}
            </Alert>
          ) : null}
          <form action={`${localOrigin}/api/ai/chatgpt`} method="post" className="flex flex-wrap items-center gap-2">
            {connection.connected ? (
              <>
                <Button type="submit" name="intent" value="test">
                  Test rewrite
                </Button>
                <Button type="submit" name="intent" value="disconnect" variant="secondary">
                  Disconnect
                </Button>
                <a className="text-primary px-2 text-sm underline" href="https://chatgpt.com/#settings/usage">
                  Manage usage
                </a>
              </>
            ) : (
              <Button type="submit" name="intent" value="connect" data-oai-siwc-button>
                Continue with ChatGPT
              </Button>
            )}
          </form>
        </Card>
      ) : null}
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
