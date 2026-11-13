"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/fields";
import { uploadResumeAction } from "@/features/resume-import/actions";
import { initialActionState } from "@/lib/action-result";

export function ImportForm({
  maxSizeMb,
  providerLabel,
  paid,
}: {
  maxSizeMb: number;
  providerLabel: string;
  paid: boolean;
}) {
  const [state, action] = useActionState(uploadResumeAction, initialActionState);
  return (
    <form action={action} className="space-y-4">
      <Field label="Resume file" htmlFor="file" hint={`PDF or DOCX, up to ${maxSizeMb} MB.`}>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
        />
      </Field>
      <p className="text-muted text-sm">
        Conversion will use <span className="text-foreground font-medium">{providerLabel}</span>.{" "}
        {paid ? "This is a cloud provider and may incur usage charges." : "This runs without external API charges."}
      </p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton pendingLabel="Extracting and analysing...">Upload and extract</SubmitButton>
    </form>
  );
}
