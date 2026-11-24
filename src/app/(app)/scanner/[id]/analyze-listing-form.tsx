"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { analyzeListingAction } from "@/features/job-scanner/actions";
import { initialActionState } from "@/lib/action-result";

/** Analyse one listing on request, for example after a scan reached its analysis limit. */
export function AnalyzeListingForm({ listingId, analyzed }: { listingId: string; analyzed: boolean }) {
  const [state, action] = useActionState(analyzeListingAction, initialActionState);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="listingId" value={listingId} />
      <SubmitButton variant={analyzed ? "secondary" : "primary"} size="sm" pendingLabel="Analysing...">
        {analyzed ? "Re-analyse" : "Analyse this job"}
      </SubmitButton>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
