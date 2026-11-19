"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/fields";
import { generateCoverLetterAction } from "@/features/cover-letter/actions";
import { initialActionState } from "@/lib/action-result";

export function GenerateLetterForm({
  jobId,
  mode,
  edited,
  instructions,
  providerLabel,
  disabled,
}: {
  jobId: string;
  mode: "generate" | "regenerate";
  /** The owner has saved edits to the current letter; generating again discards them. */
  edited: boolean;
  instructions: string;
  providerLabel: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState(generateCoverLetterAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="jobDescriptionId" value={jobId} />
      <div>
        <Label htmlFor="letter-instructions">Instructions (optional)</Label>
        <Textarea
          id="letter-instructions"
          name="userInstructions"
          defaultValue={instructions}
          maxLength={2000}
          placeholder="For example: keep it under 250 words, or focus on the design-system work."
          className="min-h-20"
        />
      </div>
      {mode === "regenerate" ? (
        <p className={edited ? "text-sm text-amber-800" : "text-muted text-xs"}>
          {edited
            ? "You have edited this letter. Generating again replaces it and your edits are lost."
            : "Generating again replaces the current letter."}
        </p>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          variant={mode === "regenerate" ? "secondary" : "primary"}
          disabled={disabled}
          pendingLabel="Writing the letter..."
        >
          {mode === "regenerate" ? "Generate again" : "Generate cover letter"}
        </SubmitButton>
        {providerLabel ? <span className="text-muted text-xs">Uses {providerLabel}</span> : null}
      </div>
    </form>
  );
}
