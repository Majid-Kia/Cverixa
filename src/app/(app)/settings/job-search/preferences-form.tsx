"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { saveJobSearchPreferencesAction } from "@/features/job-scanner/actions";
import { WORK_ARRANGEMENTS, WORK_ARRANGEMENT_LABELS } from "@/features/job-scanner/constants";
import type { JobSearchPreferencesInput } from "@/features/job-scanner/schema";
import { initialActionState } from "@/lib/action-result";
import { CountryPicker } from "./country-picker";

interface Props {
  preferences: JobSearchPreferencesInput;
  countries: Array<{ code: string; name: string }>;
  suggestedCountries: string[];
  timeZones: string[];
  nextRun: string | null;
  provider: { label: string; paid: boolean } | null;
  analysisCeiling: number;
  /** How scheduled scans are triggered on this server, in words. */
  scheduleNote: string;
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="border-border flex cursor-pointer gap-3 rounded-md border p-3">
      <Checkbox name={name} defaultChecked={defaultChecked} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted block text-sm">{hint}</span>
      </span>
    </label>
  );
}

const WEIGHTS: Array<{ name: string; key: keyof JobSearchPreferencesInput["rubric"]["weights"]; label: string }> = [
  { name: "weightMandatory", key: "mandatory", label: "Mandatory requirements" },
  { name: "weightSkills", key: "skills", label: "Named technologies" },
  { name: "weightPreferred", key: "preferred", label: "Preferred requirements" },
  { name: "weightTitle", key: "title", label: "Title alignment" },
  { name: "weightSeniority", key: "seniority", label: "Seniority and experience" },
];

export function PreferencesForm(props: Props) {
  const [state, action] = useActionState(saveJobSearchPreferencesAction, initialActionState);
  const { preferences } = props;
  return (
    <form action={action} className="space-y-4">
      <Card>
        <CardTitle>Target countries</CardTitle>
        <CountryPicker
          countries={props.countries}
          suggested={props.suggestedCountries}
          initial={preferences.countries}
        />
      </Card>

      <Card>
        <CardTitle>Job titles and keywords</CardTitle>
        <Field
          label="One per line"
          htmlFor="keywords"
          hint='A listing is kept when its title contains every word of one line, in any order. "Frontend Engineer" also matches "Senior Front-End Developer".'
        >
          <Textarea
            id="keywords"
            name="keywords"
            className="min-h-56 font-mono"
            defaultValue={preferences.keywords.join("\n")}
            required
          />
        </Field>
      </Card>

      <Card>
        <CardTitle>Employment preferences</CardTitle>
        <fieldset>
          <legend className="text-muted mb-2 text-sm">
            Select every arrangement you would accept. Listings that do not state one are kept.
          </legend>
          <div className="flex flex-wrap gap-4">
            {WORK_ARRANGEMENTS.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="workArrangements"
                  value={value}
                  defaultChecked={preferences.workArrangements.includes(value)}
                />
                {WORK_ARRANGEMENT_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card>
        <CardTitle>Visa and relocation</CardTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            name="requireSponsorship"
            label="Visa sponsorship required"
            hint="Keep only listings with confirmed or possible sponsorship. Most postings do not mention sponsorship, so expect far fewer results."
            defaultChecked={preferences.requireSponsorship}
          />
          <Toggle
            name="preferRelocation"
            label="Relocation assistance preferred"
            hint="Show what each posting states about relocation support. Does not remove listings."
            defaultChecked={preferences.preferRelocation}
          />
          <Toggle
            name="excludeWorkAuthRequired"
            label="Exclude jobs that require existing work authorisation"
            hint='Skip postings that explicitly require the right to work, a work permit or citizenship already ("must have the right to work in the UK").'
            defaultChecked={preferences.excludeWorkAuthRequired}
          />
          <Toggle
            name="excludeNoSponsorship"
            label="Exclude jobs that state sponsorship is unavailable"
            hint="Skip postings that explicitly say they do not sponsor visas."
            defaultChecked={preferences.excludeNoSponsorship}
          />
        </div>
        <p className="text-muted mt-3 text-xs">
          A posting that says nothing about visas is labelled &ldquo;Sponsorship unknown&rdquo;. It is never counted as
          sponsored.
        </p>
      </Card>

      <Card>
        <CardTitle>
          <span id="schedule">Automatic daily scan</span>
        </CardTitle>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox name="scheduleEnabled" defaultChecked={preferences.scheduleEnabled} />
            Scan automatically every day
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Time" htmlFor="scheduleTime" hint="Local time in the selected time zone.">
              <Input
                id="scheduleTime"
                name="scheduleTime"
                type="time"
                step={300}
                defaultValue={preferences.scheduleTime}
                required
              />
            </Field>
            <Field label="Time zone" htmlFor="scheduleTimezone">
              <Select id="scheduleTimezone" name="scheduleTimezone" defaultValue={preferences.scheduleTimezone}>
                {props.timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-muted text-sm">
            Frequency: daily. {preferences.scheduleEnabled && props.nextRun ? `Next run: ${props.nextRun}. ` : ""}
            Scheduled scans run on the server; no browser needs to be open.
          </p>
          <p className="text-muted text-xs">{props.scheduleNote}</p>
        </div>
      </Card>

      <Card>
        <CardTitle>AI matching and cost</CardTitle>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox name="aiMatchingEnabled" defaultChecked={preferences.aiMatchingEnabled} />
            Score listings against my Master Career Profile
          </label>
          <p className="text-muted text-sm">
            {props.provider
              ? `Uses your default AI provider, ${props.provider.label}${props.provider.paid ? ". This is a cloud provider: each analysed listing is one request on your own account." : ", which has no external charges."}`
              : "No default AI provider is selected, so listings are saved without a score."}{" "}
            One request per new listing; a posting that has not changed is never analysed twice. Your profile is not
            sent during scans: it is compared on the server.
          </p>
          <Field
            label="Listings analysed per scan (maximum)"
            htmlFor="maxAnalysesPerScan"
            hint={`0 to ${props.analysisCeiling}. Listings beyond the limit wait for the next scan or can be analysed one at a time.`}
            className="max-w-xs"
          >
            <Input
              id="maxAnalysesPerScan"
              name="maxAnalysesPerScan"
              type="number"
              min={0}
              max={props.analysisCeiling}
              defaultValue={preferences.maxAnalysesPerScan}
              required
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Job Match Score rubric</CardTitle>
        <p className="text-muted mb-3 text-sm">
          The score (0 to 100) is the weighted share of each component your confirmed profile supports. It measures
          professional relevance, not the chance of an interview. Components that do not apply to a listing are left out
          and the rest rescaled. Changing weights rescores existing listings on the next scan without any AI request.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WEIGHTS.map((weight) => (
            <Field key={weight.name} label={`${weight.label} (weight)`} htmlFor={weight.name}>
              <Input
                id={weight.name}
                name={weight.name}
                type="number"
                min={0}
                max={100}
                defaultValue={preferences.rubric.weights[weight.key]}
                required
              />
            </Field>
          ))}
          <Field label="High-relevance threshold" htmlFor="highRelevanceThreshold" hint="Scores at or above this.">
            <Input
              id="highRelevanceThreshold"
              name="highRelevanceThreshold"
              type="number"
              min={1}
              max={100}
              defaultValue={preferences.rubric.highRelevanceThreshold}
              required
            />
          </Field>
        </div>
      </Card>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <SubmitButton pendingLabel="Saving...">Save preferences</SubmitButton>
    </form>
  );
}
