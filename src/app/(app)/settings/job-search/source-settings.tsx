"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/fields";
import { saveSourceSettingAction } from "@/features/job-scanner/actions";
import { initialActionState } from "@/lib/action-result";

export interface SourceCardData {
  id: string;
  displayName: string;
  description: string;
  attribution: string;
  homepage: string;
  verified: boolean;
  enabled: boolean;
  limits: string;
  /** Company boards as text, for sources that read boards. */
  boards: string | null;
  boardHint: string;
  visaSponsorshipOnly: boolean | null;
  maxPages: number | null;
  category: string | null;
}

export function SourceSettingsCard({ source }: { source: SourceCardData }) {
  const [state, action] = useActionState(saveSourceSettingAction, initialActionState);
  return (
    <Card>
      <form action={action} className="space-y-3">
        <input type="hidden" name="sourceId" value={source.id} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{source.displayName}</h3>
            <Badge tone="success">Scanned automatically</Badge>
            {source.verified ? null : <Badge tone="warning">Not verified live</Badge>}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox name="enabled" defaultChecked={source.enabled} />
            Enabled
          </label>
        </div>
        <p className="text-muted text-sm">
          {source.description}{" "}
          <a href={source.homepage} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {new URL(source.homepage).hostname}
          </a>
        </p>
        <p className="text-muted text-xs">
          {source.attribution} {source.limits}
        </p>
        {source.boards !== null ? (
          <Field label="Company boards, one per line" htmlFor={`${source.id}-boards`} hint={source.boardHint}>
            <Textarea
              id={`${source.id}-boards`}
              name="boards"
              className="min-h-32 font-mono"
              defaultValue={source.boards}
              spellCheck={false}
            />
          </Field>
        ) : null}
        {source.visaSponsorshipOnly !== null ? (
          <>
            <input type="hidden" name="visaSponsorshipOnlyField" value="1" />
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="visaSponsorshipOnly" defaultChecked={source.visaSponsorshipOnly} className="mt-0.5" />
              <span>
                Only postings the board lists under visa sponsorship
                <span className="text-muted block text-xs">
                  The board&apos;s flag counts as possible sponsorship. It becomes confirmed only when the posting text
                  says so.
                </span>
              </span>
            </label>
          </>
        ) : null}
        {source.maxPages !== null ? (
          <Field
            label="Pages to read per scan"
            htmlFor={`${source.id}-pages`}
            hint="About 300 postings per page, newest first."
            className="max-w-xs"
          >
            <Input
              id={`${source.id}-pages`}
              name="maxPages"
              type="number"
              min={1}
              max={5}
              defaultValue={source.maxPages}
            />
          </Field>
        ) : null}
        {source.category !== null ? (
          <Field label="Category" htmlFor={`${source.id}-category`} className="max-w-xs">
            <Input id={`${source.id}-category`} name="category" defaultValue={source.category} maxLength={40} />
          </Field>
        ) : null}
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <SubmitButton size="sm" variant="secondary" pendingLabel="Saving...">
          Save {source.displayName}
        </SubmitButton>
      </form>
    </Card>
  );
}
