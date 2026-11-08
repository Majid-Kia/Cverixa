"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";
import { finalizeReviewAction } from "@/features/resume-tailoring/actions";
import type { Proposal, ProposalDecision } from "@/features/resume-tailoring/schema";
import { initialActionState } from "@/lib/action-result";

type Decision = "accept" | "reject" | "pending";

interface RowState {
  decision: Decision;
  edited: string[];
}

export function ReviewPanel({ runId, proposals, closed }: { runId: string; proposals: Proposal[]; closed: boolean }) {
  const [state, action] = useActionState(finalizeReviewAction, initialActionState);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      proposals.map((proposal) => [proposal.id, { decision: "pending" as Decision, edited: proposal.proposed }]),
    ),
  );
  const [editing, setEditing] = useState<string | null>(null);

  const setDecision = (id: string, decision: Decision) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], decision } }));
  const acceptAll = () =>
    setRows((current) =>
      Object.fromEntries(Object.entries(current).map(([id, row]) => [id, { ...row, decision: "accept" as Decision }])),
    );
  const restoreAll = () =>
    setRows((current) =>
      Object.fromEntries(Object.entries(current).map(([id, row]) => [id, { ...row, decision: "reject" as Decision }])),
    );

  const decisions: ProposalDecision[] = proposals
    .filter((proposal) => rows[proposal.id]?.decision !== "pending")
    .map((proposal) => ({
      proposalId: proposal.id,
      decision: rows[proposal.id].decision as "accept" | "reject",
      editedLines:
        rows[proposal.id].edited.join("\n") !== proposal.proposed.join("\n") ? rows[proposal.id].edited : undefined,
    }));
  const pending = proposals.filter((proposal) => rows[proposal.id]?.decision === "pending").length;

  if (proposals.length === 0) {
    return (
      <Card>
        <p className="text-muted text-sm">The AI proposed no changes to your profile content for this job.</p>
        <form action={action} className="mt-4">
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="decisions" value="[]" />
          {state.error ? (
            <Alert tone="danger" className="mb-3">
              {state.error}
            </Alert>
          ) : null}
          <SubmitButton disabled={closed}>Create resume from original content</SubmitButton>
        </form>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={acceptAll} disabled={closed}>
          Accept all
        </Button>
        <Button variant="secondary" size="sm" onClick={restoreAll} disabled={closed}>
          Restore original for all
        </Button>
        <span className="text-muted text-sm">
          {proposals.length} proposals · {pending} undecided (undecided proposals keep the original content)
        </span>
      </div>

      {proposals.map((proposal) => {
        const row = rows[proposal.id];
        const isEditing = editing === proposal.id;
        return (
          <Card
            key={proposal.id}
            className={
              row.decision === "accept"
                ? "border-green-300"
                : row.decision === "reject"
                  ? "border-slate-300 opacity-80"
                  : ""
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{proposal.label}</h3>
              <div className="flex items-center gap-2">
                {row.decision === "accept" ? (
                  <Badge tone="success">Accepted</Badge>
                ) : row.decision === "reject" ? (
                  <Badge>Original kept</Badge>
                ) : (
                  <Badge tone="warning">Undecided</Badge>
                )}
                <Button
                  size="sm"
                  variant={row.decision === "accept" ? "primary" : "secondary"}
                  onClick={() => setDecision(proposal.id, "accept")}
                  disabled={closed}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant={row.decision === "reject" ? "primary" : "secondary"}
                  onClick={() => setDecision(proposal.id, "reject")}
                  disabled={closed}
                >
                  Reject
                </Button>
                {proposal.kind !== "skills" && proposal.kind !== "section_order" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(isEditing ? null : proposal.id)}
                    disabled={closed}
                  >
                    {isEditing ? "Done editing" : "Edit"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">Original</p>
                {proposal.original.length === 0 ? (
                  <p className="text-muted text-sm">(empty)</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {proposal.original.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">Proposed</p>
                {isEditing ? (
                  <Textarea
                    aria-label={`Edit proposed text for ${proposal.label}`}
                    value={row.edited.join("\n")}
                    onChange={(event) =>
                      setRows((current) => ({
                        ...current,
                        [proposal.id]: {
                          ...current[proposal.id],
                          edited: event.target.value.split("\n"),
                          decision: "accept",
                        },
                      }))
                    }
                    className="min-h-32"
                  />
                ) : row.edited.filter(Boolean).length === 0 ? (
                  <p className="text-muted text-sm">(removed)</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {row.edited.filter(Boolean).map((line, index) => (
                      <li key={index} className={proposal.original.includes(line) ? "" : "bg-green-50"}>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="border-border bg-background/95 sticky bottom-0 flex items-center gap-3 border-t py-3 backdrop-blur">
        <SubmitButton disabled={closed} pendingLabel="Creating resume...">
          Create tailored resume
        </SubmitButton>
        <p className="text-muted text-xs">
          Accepted proposals replace the original text; everything else stays as in your profile.
        </p>
      </div>
    </form>
  );
}
