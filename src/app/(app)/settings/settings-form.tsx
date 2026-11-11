"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/fields";
import { saveProviderSettingAction } from "@/features/ai-settings/actions";
import { initialActionState } from "@/lib/action-result";
import type { ProviderDefinition } from "@/server/ai/registry";

interface SettingRow {
  providerId: string;
  modelId: string;
  isDefault: boolean;
  configuration: { timeoutMs?: number };
  updatedAt: string;
}

export function SettingsForm({
  definitions,
  settings,
  defaultProviderId,
}: {
  definitions: ProviderDefinition[];
  settings: SettingRow[];
  defaultProviderId: string | null;
}) {
  return (
    <div className="space-y-4">
      {definitions.map((definition) => (
        <ProviderCard
          key={definition.id}
          definition={definition}
          setting={settings.find((row) => row.providerId === definition.id)}
          isDefault={defaultProviderId === definition.id}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  definition,
  setting,
  isDefault,
}: {
  definition: ProviderDefinition;
  setting?: SettingRow;
  isDefault: boolean;
}) {
  const [state, action] = useActionState(saveProviderSettingAction, initialActionState);
  const [models, setModels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [modelId, setModelId] = useState(setting?.modelId ?? definition.suggestedModels[0] ?? "");
  const [status, setStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<"check" | "models" | null>(null);

  const check = async () => {
    setBusy("check");
    try {
      const response = await fetch(`/api/ai/check?provider=${definition.id}`);
      const data = (await response.json()) as { available: boolean; message: string };
      setStatus(data);
    } catch {
      setStatus({ available: false, message: "Connection check failed." });
    } finally {
      setBusy(null);
    }
  };

  const loadModels = async () => {
    setBusy("models");
    try {
      const response = await fetch(`/api/ai/models?provider=${definition.id}`);
      const data = (await response.json()) as { models?: Array<{ id: string; displayName: string }>; error?: string };
      if (data.models) {
        setModels(data.models);
        setStatus({ available: true, message: `${data.models.length} models available.` });
      } else {
        setStatus({ available: false, message: data.error ?? "Could not list models." });
      }
    } catch {
      setStatus({ available: false, message: "Could not list models." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <form action={action} className="space-y-3">
        <input type="hidden" name="providerId" value={definition.id} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{definition.displayName}</h3>
            {isDefault ? <Badge tone="success">Default</Badge> : null}
            {definition.id === "chatgpt" ? (
              <Badge tone="info">Uses ChatGPT plan</Badge>
            ) : definition.paid ? (
              <Badge tone="warning">Paid usage</Badge>
            ) : (
              <Badge tone="info">No external charges</Badge>
            )}
            {definition.configured ? null : <Badge tone="danger">Not configured</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={check} disabled={busy !== null || !definition.configured}>
              {busy === "check" ? "Checking..." : "Test connection"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={loadModels}
              disabled={busy !== null || !definition.configured}
            >
              {busy === "models" ? "Loading..." : "Load models"}
            </Button>
          </div>
        </div>
        <p className="text-muted text-sm">{definition.configurationHint}</p>
        {status ? <Alert tone={status.available ? "success" : "danger"}>{status.message}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field
            label="Model"
            htmlFor={`${definition.id}-model`}
            hint={`Suggested: ${definition.suggestedModels.join(", ")}`}
          >
            {models.length > 0 ? (
              <Select
                id={`${definition.id}-model`}
                name="modelId"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              >
                {!models.some((model) => model.id === modelId) && modelId ? (
                  <option value={modelId}>{modelId}</option>
                ) : null}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`${definition.id}-model`}
                name="modelId"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                list={`${definition.id}-suggestions`}
              />
            )}
            <datalist id={`${definition.id}-suggestions`}>
              {definition.suggestedModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </Field>
          <Field label="Timeout (ms)" htmlFor={`${definition.id}-timeout`} hint="Leave empty for the server default.">
            <Input
              id={`${definition.id}-timeout`}
              name="timeoutMs"
              type="number"
              min={5000}
              max={600000}
              step={1000}
              defaultValue={setting?.configuration.timeoutMs ?? ""}
            />
          </Field>
        </div>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="makeDefault" value="true" disabled={!definition.configured} pendingLabel="Saving...">
            Save and use as default
          </SubmitButton>
          <SubmitButton
            name="makeDefault"
            value="false"
            variant="secondary"
            disabled={!definition.configured}
            pendingLabel="Saving..."
          >
            Save model only
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
