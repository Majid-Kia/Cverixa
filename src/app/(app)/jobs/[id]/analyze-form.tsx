"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/card";
import { analyzeJobAction } from "@/features/job-analysis/actions";
import { initialActionState } from "@/lib/action-result";

export function AnalyzeForm({
  jobId,
  canAnalyze,
  analyzed,
}: {
  jobId: string;
  canAnalyze: boolean;
  analyzed: boolean;
}) {
  const [state, action] = useActionState(analyzeJobAction, initialActionState);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={jobId} />
      <SubmitButton
        variant={analyzed ? "secondary" : "primary"}
        size="sm"
        disabled={!canAnalyze}
        pendingLabel="Analysing..."
      >
        {analyzed ? "Re-analyse" : "Analyse requirements"}
      </SubmitButton>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
