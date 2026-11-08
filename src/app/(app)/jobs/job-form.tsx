"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/fields";
import { createJobAction, updateJobAction } from "@/features/job-analysis/actions";
import type { JobDescriptionView } from "@/features/job-analysis/service";
import { initialActionState } from "@/lib/action-result";

export function JobForm({
  mode,
  job,
  canAnalyze,
}: {
  mode: "create" | "edit";
  job?: JobDescriptionView;
  canAnalyze: boolean;
}) {
  const [state, action] = useActionState(mode === "create" ? createJobAction : updateJobAction, initialActionState);
  return (
    <form action={action} className="space-y-4">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Job title (optional)" htmlFor="title">
          <Input id="title" name="title" defaultValue={job?.title ?? ""} />
        </Field>
        <Field label="Company (optional)" htmlFor="company">
          <Input id="company" name="company" defaultValue={job?.company ?? ""} />
        </Field>
        <Field label="Location (optional)" htmlFor="location">
          <Input id="location" name="location" defaultValue={job?.location ?? ""} />
        </Field>
        <Field label="Posting URL (optional)" htmlFor="sourceUrl" hint="Informational only; the page is not fetched.">
          <Input id="sourceUrl" name="sourceUrl" defaultValue={job?.sourceUrl ?? ""} />
        </Field>
      </div>
      <Field
        label="Job description text"
        htmlFor="originalText"
        hint="Paste the full posting. It is treated as untrusted input and shown to the AI as data only."
      >
        <Textarea
          id="originalText"
          name="originalText"
          defaultValue={job?.originalText ?? ""}
          required
          className="min-h-64 font-mono text-xs"
        />
      </Field>
      <Field label="Notes (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={job?.notes ?? ""} className="min-h-16" />
      </Field>
      {mode === "create" ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="analyze" value="true" defaultChecked={canAnalyze} disabled={!canAnalyze} />
          Analyse requirements with the default AI provider after saving
          {!canAnalyze ? <span className="text-muted">(configure a provider first)</span> : null}
        </label>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <SubmitButton pendingLabel={mode === "create" ? "Saving..." : "Saving..."}>
        {mode === "create" ? "Save job description" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
