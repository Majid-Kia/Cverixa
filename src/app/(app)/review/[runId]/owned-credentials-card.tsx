"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Input, Label, Select } from "@/components/ui/fields";
import {
  describeOwnedCredential,
  ownedCredentialSchema,
  suggestCredentialKind,
  type OwnedCredential,
  type OwnedCredentialKind,
} from "@/features/resume-tailoring/owned-credentials";

const KIND_LABELS: Record<OwnedCredentialKind, string> = {
  certification: "Certification or licence",
  education: "Degree or diploma",
  statement: "Something else (for example work eligibility)",
};

const SECTION_LABELS: Record<OwnedCredentialKind, string> = {
  certification: "Certifications",
  education: "Education",
  statement: "Additional information",
};

const EMPTY_DRAFT = { name: "", issuer: "", date: "", degree: "", fieldOfStudy: "", institution: "", text: "" };
type Draft = typeof EMPTY_DRAFT;

/**
 * Degrees, certifications and eligibility the job asks for. The application
 * never fills these in: every field starts empty and what the owner types is
 * placed on the resume as written.
 */
export function OwnedCredentialsCard({
  requirements,
  entered,
  onChange,
  saveToProfile,
  onSaveToProfileChange,
}: {
  requirements: string[];
  entered: OwnedCredential[];
  onChange: (next: OwnedCredential[]) => void;
  saveToProfile: boolean;
  onSaveToProfileChange: (next: boolean) => void;
}) {
  return (
    <div data-testid="owned-credentials">
      <Card className="border-blue-200">
        <h3 className="font-semibold">Only you can add these</h3>
        <p className="text-muted mt-1 text-sm">
          The job asks for these and your profile does not show them. Employers check degrees, certifications, licences
          and work eligibility, so they are never written for you. If you hold one, enter it here and it goes onto this
          resume exactly as you write it. Leave the rest alone.
        </p>
        <ul className="divide-border mt-3 divide-y">
          {requirements.map((requirement) => (
            <CredentialRow
              key={requirement}
              requirement={requirement}
              entry={entered.find((item) => item.requirement === requirement) ?? null}
              onAdd={(item) => onChange([...entered.filter((other) => other.requirement !== requirement), item])}
              onRemove={() => onChange(entered.filter((other) => other.requirement !== requirement))}
            />
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox
            checked={saveToProfile}
            onChange={(event) => onSaveToProfileChange(event.target.checked)}
            disabled={entered.length === 0}
          />
          Also save what I enter to my Master Career Profile for future applications
        </label>
      </Card>
    </div>
  );
}

function CredentialRow({
  requirement,
  entry,
  onAdd,
  onRemove,
}: {
  requirement: string;
  entry: OwnedCredential | null;
  onAdd: (item: OwnedCredential) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OwnedCredentialKind>(() => suggestCredentialKind(requirement));
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const add = () => {
    const candidate =
      kind === "certification"
        ? { kind, requirement, name: draft.name, issuer: draft.issuer, date: draft.date }
        : kind === "education"
          ? {
              kind,
              requirement,
              degree: draft.degree,
              fieldOfStudy: draft.fieldOfStudy,
              institution: draft.institution,
              endDate: draft.date,
            }
          : { kind, requirement, text: draft.text };
    const parsed = ownedCredentialSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        kind === "certification"
          ? "Enter the name of the certification or licence."
          : kind === "education"
            ? "Enter the degree and the school."
            : "Write the line that should appear on your resume.",
      );
      return;
    }
    setError("");
    setOpen(false);
    onAdd(parsed.data);
  };

  // These fields sit inside the review form; Enter must add the entry, not create the resume.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      add();
    }
  };

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{requirement}</p>
        {entry ? (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        ) : open ? null : (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            I have this
          </Button>
        )}
      </div>
      {entry ? (
        <p className="mt-1 rounded-md bg-green-50 px-2 py-1 text-sm">
          Will be added under {SECTION_LABELS[entry.kind]}:{" "}
          <span className="font-medium">{describeOwnedCredential(entry)}</span>
        </p>
      ) : open ? (
        <div className="mt-2 space-y-2" onKeyDown={onKeyDown}>
          <div>
            <Label htmlFor={`${id}-kind`}>What is it?</Label>
            <Select
              id={`${id}-kind`}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as OwnedCredentialKind);
                setError("");
              }}
            >
              {(Object.keys(KIND_LABELS) as OwnedCredentialKind[]).map((option) => (
                <option key={option} value={option}>
                  {KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>
          {kind === "certification" ? (
            <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr]">
              <div>
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input id={`${id}-name`} value={draft.name} onChange={set("name")} maxLength={200} />
              </div>
              <div>
                <Label htmlFor={`${id}-issuer`}>Issued by</Label>
                <Input id={`${id}-issuer`} value={draft.issuer} onChange={set("issuer")} maxLength={200} />
              </div>
              <div>
                <Label htmlFor={`${id}-date`}>Year</Label>
                <Input id={`${id}-date`} value={draft.date} onChange={set("date")} maxLength={40} />
              </div>
            </div>
          ) : kind === "education" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${id}-degree`}>Degree</Label>
                <Input id={`${id}-degree`} value={draft.degree} onChange={set("degree")} maxLength={200} />
              </div>
              <div>
                <Label htmlFor={`${id}-field`}>Field of study</Label>
                <Input id={`${id}-field`} value={draft.fieldOfStudy} onChange={set("fieldOfStudy")} maxLength={200} />
              </div>
              <div>
                <Label htmlFor={`${id}-school`}>School</Label>
                <Input id={`${id}-school`} value={draft.institution} onChange={set("institution")} maxLength={200} />
              </div>
              <div>
                <Label htmlFor={`${id}-date`}>Year completed</Label>
                <Input id={`${id}-date`} value={draft.date} onChange={set("date")} maxLength={40} />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor={`${id}-text`}>Line for your resume</Label>
              <Input id={`${id}-text`} value={draft.text} onChange={set("text")} maxLength={300} />
            </div>
          )}
          {error ? (
            <p className="text-danger text-xs" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={add}>
              Add to this resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
