"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { generateResumeAction } from "@/features/resume-tailoring/actions";
import { initialActionState } from "@/lib/action-result";

interface Props {
  jobs: Array<{ id: string; label: string; analysed: boolean }>;
  templates: Array<{ id: string; name: string; description: string }>;
  providers: Array<{ id: string; label: string; paid: boolean; savedModel: string }>;
  defaultProviderId: string;
  defaultModelId: string;
  defaultProviderLabel: string;
  initialJobId: string;
  initialMode: "quick" | "review";
  disabled: boolean;
}

export function GenerateForm(props: Props) {
  const [state, action] = useActionState(generateResumeAction, initialActionState);
  const [providerId, setProviderId] = useState(props.defaultProviderId);
  const [modelId, setModelId] = useState(props.defaultModelId);
  const [overrideProvider, setOverrideProvider] = useState(false);
  const selectedProvider = props.providers.find((provider) => provider.id === providerId);

  return (
    <form action={action} className="space-y-5">
      <Field label="Job description" htmlFor="jobDescriptionId">
        <Select
          id="jobDescriptionId"
          name="jobDescriptionId"
          defaultValue={props.initialJobId}
          required
          disabled={props.disabled}
        >
          <option value="">Select a job description</option>
          {props.jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.label}
              {job.analysed ? "" : " (will be analysed first)"}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Generation mode</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="border-border has-[:checked]:border-primary flex cursor-pointer gap-3 rounded-md border p-3 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="mode"
              value="quick"
              defaultChecked={props.initialMode === "quick"}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Quick Generate</span>
              <span className="text-muted block text-sm">
                One click. Validated result is saved as a new resume version with a change summary.
              </span>
            </span>
          </label>
          <label className="border-border has-[:checked]:border-primary flex cursor-pointer gap-3 rounded-md border p-3 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="mode"
              value="review"
              defaultChecked={props.initialMode === "review"}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Review Mode</span>
              <span className="text-muted block text-sm">
                See original and proposed text side by side; accept, reject or edit each change.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template" htmlFor="templateId">
          <Select id="templateId" name="templateId" defaultValue={props.templates[0]?.id}>
            {props.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Page format" htmlFor="pageFormat">
          <Select id="pageFormat" name="pageFormat" defaultValue="A4">
            <option value="A4">A4</option>
            <option value="Letter">US Letter</option>
          </Select>
        </Field>
      </div>

      <div className="border-border rounded-md border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            AI provider:{" "}
            <span className="font-medium">
              {overrideProvider && selectedProvider
                ? `${selectedProvider.label} / ${modelId || selectedProvider.savedModel || "(model required)"}`
                : props.defaultProviderLabel || "not configured"}
            </span>
            {(
              overrideProvider
                ? selectedProvider?.paid
                : props.providers.find((p) => p.id === props.defaultProviderId)?.paid
            ) ? (
              <span className="text-warning ml-2 text-xs">cloud provider, usage may incur charges</span>
            ) : (
              <span className="text-muted ml-2 text-xs">no external charges</span>
            )}
          </p>
          <button
            type="button"
            className="text-primary text-sm font-medium hover:underline"
            onClick={() => setOverrideProvider((value) => !value)}
          >
            {overrideProvider ? "Use default" : "Use a different provider for this run"}
          </button>
        </div>
        {overrideProvider ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Provider" htmlFor="providerId">
              <Select
                id="providerId"
                name="providerId"
                value={providerId}
                onChange={(event) => {
                  setProviderId(event.target.value);
                  setModelId(props.providers.find((provider) => provider.id === event.target.value)?.savedModel ?? "");
                }}
              >
                {props.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model id" htmlFor="modelId">
              <Input
                id="modelId"
                name="modelId"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder="Model identifier"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <Field
        label="Optional instructions"
        htmlFor="userInstructions"
        hint="For example: emphasise leadership, keep to one page where possible. Instructions cannot add unverified facts."
      >
        <Textarea id="userInstructions" name="userInstructions" className="min-h-20" maxLength={2000} />
      </Field>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton disabled={props.disabled} pendingLabel="Analysing, tailoring and validating...">
        Generate Resume
      </SubmitButton>
      <p className="text-muted text-xs">
        Your profile and the job description are sent to the selected AI provider. The master profile is never modified.
      </p>
    </form>
  );
}
