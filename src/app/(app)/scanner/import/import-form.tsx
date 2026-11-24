"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { importJobAction } from "@/features/job-scanner/actions";
import { initialActionState } from "@/lib/action-result";

export function ImportForm() {
  const [state, action] = useActionState(importJobAction, initialActionState);
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Link to the posting"
        htmlFor="import-url"
        hint="For example https://www.linkedin.com/jobs/view/1234567890"
      >
        <Input id="import-url" name="url" type="url" required maxLength={2000} placeholder="https://" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor="import-title">
          <Input id="import-title" name="title" required maxLength={200} />
        </Field>
        <Field label="Company" htmlFor="import-company">
          <Input id="import-company" name="company" required maxLength={200} />
        </Field>
      </div>
      <Field label="Location" htmlFor="import-location" hint="City and country as stated in the posting, if any.">
        <Input id="import-location" name="location" maxLength={200} placeholder="Amsterdam, Netherlands" />
      </Field>
      <Field
        label="Job description"
        htmlFor="import-description"
        hint="Paste the full text, including anything it says about visas, relocation and work authorisation."
      >
        <Textarea id="import-description" name="description" required minLength={50} className="min-h-64" />
      </Field>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton pendingLabel="Importing...">Import posting</SubmitButton>
    </form>
  );
}
