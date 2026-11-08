"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { initialActionState, type ActionState } from "@/lib/action-result";
import { newId } from "@/lib/ids";
import type {
  AdditionalSection,
  CareerProfileData,
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  FactStatus,
  LanguageEntry,
  ProjectEntry,
  SkillEntry,
  Statement,
} from "./schema";

type SaveAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export interface ProfileEditorProps {
  initialData: CareerProfileData;
  action: SaveAction;
  /** Extra hidden fields (e.g. import session id). */
  hiddenFields?: Record<string, string>;
  warnings?: string[];
  saveLabel?: string;
  confirmLabel?: string;
  heading?: ReactNode;
}

export function ProfileEditor({
  initialData,
  action,
  hiddenFields = {},
  warnings = [],
  saveLabel = "Save draft",
  confirmLabel = "Confirm profile",
  heading,
}: ProfileEditorProps) {
  const [profile, setProfile] = useState<CareerProfileData>(initialData);
  const [state, formAction] = useActionState(action, initialActionState);

  const update = <K extends keyof CareerProfileData>(key: K, value: CareerProfileData[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="data" value={JSON.stringify(profile)} />
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {heading}
      {warnings.length > 0 ? (
        <Alert tone="warning" title="Review these items before confirming">
          <ul className="list-disc pl-5">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <PersonalSection profile={profile} onChange={(personal) => update("personal", personal)} />
      <SummarySection profile={profile} onChange={(summary) => update("summary", summary)} />
      <ExperienceSection items={profile.experience} onChange={(items) => update("experience", items)} />
      <SkillsSection items={profile.skills} onChange={(items) => update("skills", items)} />
      <ProjectsSection items={profile.projects} onChange={(items) => update("projects", items)} />
      <EducationSection items={profile.education} onChange={(items) => update("education", items)} />
      <CertificationsSection items={profile.certifications} onChange={(items) => update("certifications", items)} />
      <LanguagesSection items={profile.languages} onChange={(items) => update("languages", items)} />
      <AdditionalSectionsEditor
        items={profile.additionalSections}
        onChange={(items) => update("additionalSections", items)}
      />

      <div className="border-border bg-background/95 sticky bottom-0 flex flex-wrap items-center gap-3 border-t py-3 backdrop-blur">
        <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Saving...">
          {saveLabel}
        </SubmitButton>
        <SubmitButton name="intent" value="confirm" pendingLabel="Confirming...">
          {confirmLabel}
        </SubmitButton>
        <p className="text-muted text-xs">
          Confirming marks every entry as verified and makes it eligible evidence for AI tailoring.
        </p>
      </div>
    </form>
  );
}

/* ----------------------------- helpers ----------------------------- */

function linesToStatements(text: string, existing: Statement[]): Statement[] {
  const remaining = [...existing];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const byText = remaining.findIndex((item) => item.text === line);
      const match = byText >= 0 ? remaining.splice(byText, 1)[0] : remaining[index] && remaining.splice(index, 1)[0];
      return { id: match?.id ?? newId("stmt"), text: line };
    });
}

function statementsToLines(items: Array<{ text: string }>): string {
  return items.map((item) => item.text).join("\n");
}

function csv(values: string[]): string {
  return values.join(", ");
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

function StatusControl({ status, onChange }: { status: FactStatus; onChange: (status: FactStatus) => void }) {
  const id = useId();
  const tone = status === "confirmed" ? "success" : status === "imported" ? "warning" : "info";
  const label =
    status === "confirmed" ? "Confirmed" : status === "imported" ? "Imported, unconfirmed" : "AI suggestion";
  return (
    <div className="flex items-center gap-2">
      <Badge tone={tone}>{label}</Badge>
      <label htmlFor={id} className="text-muted flex items-center gap-1 text-xs">
        <Checkbox
          id={id}
          checked={status === "confirmed"}
          onChange={(event) => onChange(event.target.checked ? "confirmed" : "imported")}
        />
        Verified by me
      </label>
    </div>
  );
}

function EntryToolbar({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
        Up
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
        Down
      </Button>
      <Button size="sm" variant="danger" onClick={onRemove} aria-label="Remove entry">
        Remove
      </Button>
    </div>
  );
}

function SectionCard({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string;
  children: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle className="mb-0">{title}</CardTitle>
        {onAdd ? (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            {addLabel ?? "Add"}
          </Button>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/* ----------------------------- sections ----------------------------- */

function PersonalSection({
  profile,
  onChange,
}: {
  profile: CareerProfileData;
  onChange: (personal: CareerProfileData["personal"]) => void;
}) {
  const p = profile.personal;
  const set = (key: keyof CareerProfileData["personal"], value: string) => onChange({ ...p, [key]: value });
  return (
    <SectionCard title="Personal information">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" value={p.fullName} onChange={(e) => set("fullName", e.target.value)} required />
        </Field>
        <Field label="Professional headline" htmlFor="headline">
          <Input
            id="headline"
            value={p.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Senior Software Engineer"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" value={p.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" value={p.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input id="location" value={p.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="LinkedIn URL" htmlFor="linkedinUrl">
          <Input id="linkedinUrl" value={p.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
        </Field>
        <Field label="GitHub URL" htmlFor="githubUrl">
          <Input id="githubUrl" value={p.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} />
        </Field>
        <Field label="Portfolio URL" htmlFor="portfolioUrl">
          <Input id="portfolioUrl" value={p.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} />
        </Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Other links</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...p, links: [...p.links, { id: newId("link"), label: "", url: "" }] })}
          >
            Add link
          </Button>
        </div>
        {p.links.map((link, index) => (
          <div key={link.id} className="mb-2 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <Input
              aria-label="Link label"
              placeholder="Label"
              value={link.label}
              onChange={(e) =>
                onChange({ ...p, links: p.links.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)) })
              }
            />
            <Input
              aria-label="Link URL"
              placeholder="https://"
              value={link.url}
              onChange={(e) =>
                onChange({ ...p, links: p.links.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)) })
              }
            />
            <Button
              size="sm"
              variant="danger"
              onClick={() => onChange({ ...p, links: p.links.filter((_, i) => i !== index) })}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SummarySection({
  profile,
  onChange,
}: {
  profile: CareerProfileData;
  onChange: (summary: CareerProfileData["summary"]) => void;
}) {
  const s = profile.summary;
  return (
    <SectionCard title="Professional summary">
      <Field
        label="Summary"
        htmlFor="summaryText"
        hint="Full-length summary used as the default when no tailored summary is generated."
      >
        <Textarea id="summaryText" value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Key strengths" htmlFor="keyStrengths" hint="One per line">
          <Textarea
            id="keyStrengths"
            value={s.keyStrengths.join("\n")}
            onChange={(e) =>
              onChange({
                ...s,
                keyStrengths: e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Specializations" htmlFor="specializations" hint="One per line">
          <Textarea
            id="specializations"
            value={s.specializations.join("\n")}
            onChange={(e) =>
              onChange({
                ...s,
                specializations: e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Career highlights" htmlFor="highlights" hint="One per line">
          <Textarea
            id="highlights"
            value={s.highlights.join("\n")}
            onChange={(e) =>
              onChange({
                ...s,
                highlights: e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </div>
    </SectionCard>
  );
}

function ExperienceSection({
  items,
  onChange,
}: {
  items: ExperienceEntry[];
  onChange: (items: ExperienceEntry[]) => void;
}) {
  const setItem = (index: number, patch: Partial<ExperienceEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([
      ...items,
      {
        id: newId("exp"),
        status: "confirmed",
        employer: "",
        title: "",
        location: "",
        employmentType: "",
        startDate: "",
        endDate: "",
        responsibilities: [],
        achievements: [],
        technologies: [],
        sourceReference: "",
      },
    ]);
  return (
    <SectionCard title="Work experience" onAdd={add} addLabel="Add role">
      {items.length === 0 ? <p className="text-muted text-sm">No roles yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="border-border rounded-md border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Job title" htmlFor={`${item.id}-title`}>
              <Input
                id={`${item.id}-title`}
                value={item.title}
                onChange={(e) => setItem(index, { title: e.target.value })}
              />
            </Field>
            <Field label="Employer" htmlFor={`${item.id}-employer`}>
              <Input
                id={`${item.id}-employer`}
                value={item.employer}
                onChange={(e) => setItem(index, { employer: e.target.value })}
              />
            </Field>
            <Field label="Location" htmlFor={`${item.id}-location`}>
              <Input
                id={`${item.id}-location`}
                value={item.location}
                onChange={(e) => setItem(index, { location: e.target.value })}
              />
            </Field>
            <Field label="Employment type" htmlFor={`${item.id}-type`}>
              <Input
                id={`${item.id}-type`}
                value={item.employmentType}
                onChange={(e) => setItem(index, { employmentType: e.target.value })}
                placeholder="Full-time, Contract..."
              />
            </Field>
            <Field label="Start date" htmlFor={`${item.id}-start`}>
              <Input
                id={`${item.id}-start`}
                value={item.startDate}
                onChange={(e) => setItem(index, { startDate: e.target.value })}
                placeholder="Mar 2021"
              />
            </Field>
            <Field label="End date" htmlFor={`${item.id}-end`} hint="Leave empty for Present">
              <Input
                id={`${item.id}-end`}
                value={item.endDate}
                onChange={(e) => setItem(index, { endDate: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label="Achievements"
              htmlFor={`${item.id}-ach`}
              hint="One per line. Keep metrics exactly as verified."
            >
              <Textarea
                id={`${item.id}-ach`}
                defaultValue={statementsToLines(item.achievements)}
                onBlur={(e) =>
                  setItem(index, {
                    achievements: linesToStatements(e.target.value, item.achievements).map((statement) => ({
                      ...statement,
                      metrics: item.achievements.find((a) => a.id === statement.id)?.metrics ?? [],
                    })),
                  })
                }
              />
            </Field>
            <Field label="Responsibilities" htmlFor={`${item.id}-resp`} hint="One per line">
              <Textarea
                id={`${item.id}-resp`}
                defaultValue={statementsToLines(item.responsibilities)}
                onBlur={(e) =>
                  setItem(index, { responsibilities: linesToStatements(e.target.value, item.responsibilities) })
                }
              />
            </Field>
          </div>
          <Field label="Technologies" htmlFor={`${item.id}-tech`} hint="Comma separated" className="mt-3">
            <Input
              id={`${item.id}-tech`}
              defaultValue={csv(item.technologies)}
              onBlur={(e) => setItem(index, { technologies: parseCsv(e.target.value) })}
            />
          </Field>
        </div>
      ))}
    </SectionCard>
  );
}

function SkillsSection({ items, onChange }: { items: SkillEntry[]; onChange: (items: SkillEntry[]) => void }) {
  const setItem = (index: number, patch: Partial<SkillEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([
      ...items,
      { id: newId("skill"), status: "confirmed", name: "", category: "General", proficiency: "", evidenceRefs: [] },
    ]);
  return (
    <SectionCard title="Skills" onAdd={add} addLabel="Add skill">
      {items.length === 0 ? <p className="text-muted text-sm">No skills yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="grid items-end gap-2 md:grid-cols-[2fr_1.5fr_1fr_auto_auto]">
          <Field label="Skill" htmlFor={`${item.id}-name`}>
            <Input
              id={`${item.id}-name`}
              value={item.name}
              onChange={(e) => setItem(index, { name: e.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor={`${item.id}-cat`}>
            <Input
              id={`${item.id}-cat`}
              value={item.category}
              onChange={(e) => setItem(index, { category: e.target.value })}
            />
          </Field>
          <Field label="Proficiency" htmlFor={`${item.id}-prof`}>
            <Input
              id={`${item.id}-prof`}
              value={item.proficiency}
              onChange={(e) => setItem(index, { proficiency: e.target.value })}
            />
          </Field>
          <div className="pb-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
          </div>
          <div className="pb-1">
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function ProjectsSection({ items, onChange }: { items: ProjectEntry[]; onChange: (items: ProjectEntry[]) => void }) {
  const setItem = (index: number, patch: Partial<ProjectEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([
      ...items,
      {
        id: newId("proj"),
        status: "confirmed",
        name: "",
        description: "",
        role: "",
        technologies: [],
        outcomes: [],
        url: "",
        repositoryUrl: "",
      },
    ]);
  return (
    <SectionCard title="Projects" onAdd={add} addLabel="Add project">
      {items.length === 0 ? <p className="text-muted text-sm">No projects yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="border-border rounded-md border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Project name" htmlFor={`${item.id}-name`}>
              <Input
                id={`${item.id}-name`}
                value={item.name}
                onChange={(e) => setItem(index, { name: e.target.value })}
              />
            </Field>
            <Field label="Role" htmlFor={`${item.id}-role`}>
              <Input
                id={`${item.id}-role`}
                value={item.role}
                onChange={(e) => setItem(index, { role: e.target.value })}
              />
            </Field>
            <Field label="Project URL" htmlFor={`${item.id}-url`}>
              <Input id={`${item.id}-url`} value={item.url} onChange={(e) => setItem(index, { url: e.target.value })} />
            </Field>
            <Field label="Repository URL" htmlFor={`${item.id}-repo`}>
              <Input
                id={`${item.id}-repo`}
                value={item.repositoryUrl}
                onChange={(e) => setItem(index, { repositoryUrl: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor={`${item.id}-desc`} className="mt-3">
            <Textarea
              id={`${item.id}-desc`}
              value={item.description}
              onChange={(e) => setItem(index, { description: e.target.value })}
            />
          </Field>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Verified outcomes" htmlFor={`${item.id}-out`} hint="One per line">
              <Textarea
                id={`${item.id}-out`}
                defaultValue={statementsToLines(item.outcomes)}
                onBlur={(e) => setItem(index, { outcomes: linesToStatements(e.target.value, item.outcomes) })}
              />
            </Field>
            <Field label="Technologies" htmlFor={`${item.id}-tech`} hint="Comma separated">
              <Input
                id={`${item.id}-tech`}
                defaultValue={csv(item.technologies)}
                onBlur={(e) => setItem(index, { technologies: parseCsv(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function EducationSection({
  items,
  onChange,
}: {
  items: EducationEntry[];
  onChange: (items: EducationEntry[]) => void;
}) {
  const setItem = (index: number, patch: Partial<EducationEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([
      ...items,
      {
        id: newId("edu"),
        status: "confirmed",
        institution: "",
        degree: "",
        fieldOfStudy: "",
        startDate: "",
        endDate: "",
        details: [],
      },
    ]);
  return (
    <SectionCard title="Education" onAdd={add} addLabel="Add education">
      {items.length === 0 ? <p className="text-muted text-sm">No education entries yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="border-border rounded-md border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Institution" htmlFor={`${item.id}-inst`}>
              <Input
                id={`${item.id}-inst`}
                value={item.institution}
                onChange={(e) => setItem(index, { institution: e.target.value })}
              />
            </Field>
            <Field label="Degree" htmlFor={`${item.id}-deg`}>
              <Input
                id={`${item.id}-deg`}
                value={item.degree}
                onChange={(e) => setItem(index, { degree: e.target.value })}
              />
            </Field>
            <Field label="Field of study" htmlFor={`${item.id}-field`}>
              <Input
                id={`${item.id}-field`}
                value={item.fieldOfStudy}
                onChange={(e) => setItem(index, { fieldOfStudy: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" htmlFor={`${item.id}-start`}>
                <Input
                  id={`${item.id}-start`}
                  value={item.startDate}
                  onChange={(e) => setItem(index, { startDate: e.target.value })}
                />
              </Field>
              <Field label="End" htmlFor={`${item.id}-end`}>
                <Input
                  id={`${item.id}-end`}
                  value={item.endDate}
                  onChange={(e) => setItem(index, { endDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <Field label="Relevant details" htmlFor={`${item.id}-details`} hint="One per line" className="mt-3">
            <Textarea
              id={`${item.id}-details`}
              defaultValue={item.details.join("\n")}
              onBlur={(e) =>
                setItem(index, {
                  details: e.target.value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </div>
      ))}
    </SectionCard>
  );
}

function CertificationsSection({
  items,
  onChange,
}: {
  items: CertificationEntry[];
  onChange: (items: CertificationEntry[]) => void;
}) {
  const setItem = (index: number, patch: Partial<CertificationEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([...items, { id: newId("cert"), status: "confirmed", name: "", issuer: "", date: "", credentialUrl: "" }]);
  return (
    <SectionCard title="Certifications" onAdd={add} addLabel="Add certification">
      {items.length === 0 ? <p className="text-muted text-sm">No certifications yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="grid items-end gap-2 md:grid-cols-[2fr_1.5fr_1fr_2fr_auto_auto]">
          <Field label="Name" htmlFor={`${item.id}-name`}>
            <Input
              id={`${item.id}-name`}
              value={item.name}
              onChange={(e) => setItem(index, { name: e.target.value })}
            />
          </Field>
          <Field label="Issuer" htmlFor={`${item.id}-issuer`}>
            <Input
              id={`${item.id}-issuer`}
              value={item.issuer}
              onChange={(e) => setItem(index, { issuer: e.target.value })}
            />
          </Field>
          <Field label="Date" htmlFor={`${item.id}-date`}>
            <Input
              id={`${item.id}-date`}
              value={item.date}
              onChange={(e) => setItem(index, { date: e.target.value })}
            />
          </Field>
          <Field label="Credential URL" htmlFor={`${item.id}-url`}>
            <Input
              id={`${item.id}-url`}
              value={item.credentialUrl}
              onChange={(e) => setItem(index, { credentialUrl: e.target.value })}
            />
          </Field>
          <div className="pb-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
          </div>
          <div className="pb-1">
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function LanguagesSection({ items, onChange }: { items: LanguageEntry[]; onChange: (items: LanguageEntry[]) => void }) {
  const setItem = (index: number, patch: Partial<LanguageEntry>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () => onChange([...items, { id: newId("lang"), status: "confirmed", language: "", proficiency: "" }]);
  return (
    <SectionCard title="Languages" onAdd={add} addLabel="Add language">
      {items.length === 0 ? <p className="text-muted text-sm">No languages yet.</p> : null}
      {items.map((item, index) => (
        <div key={item.id} className="grid items-end gap-2 md:grid-cols-[2fr_2fr_auto_auto]">
          <Field label="Language" htmlFor={`${item.id}-lang`}>
            <Input
              id={`${item.id}-lang`}
              value={item.language}
              onChange={(e) => setItem(index, { language: e.target.value })}
            />
          </Field>
          <Field label="Proficiency" htmlFor={`${item.id}-prof`}>
            <Input
              id={`${item.id}-prof`}
              value={item.proficiency}
              onChange={(e) => setItem(index, { proficiency: e.target.value })}
              placeholder="Native, C1, Professional..."
            />
          </Field>
          <div className="pb-2">
            <StatusControl status={item.status} onChange={(status) => setItem(index, { status })} />
          </div>
          <div className="pb-1">
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function AdditionalSectionsEditor({
  items,
  onChange,
}: {
  items: AdditionalSection[];
  onChange: (items: AdditionalSection[]) => void;
}) {
  const setItem = (index: number, patch: Partial<AdditionalSection>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([...items, { id: newId("sec"), status: "confirmed", kind: "other", title: "", items: [] }]);
  return (
    <SectionCard title="Additional sections" onAdd={add} addLabel="Add section">
      {items.length === 0 ? (
        <p className="text-muted text-sm">Publications, awards, volunteer work, open-source contributions and more.</p>
      ) : null}
      {items.map((section, index) => (
        <div key={section.id} className="border-border rounded-md border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <StatusControl status={section.status} onChange={(status) => setItem(index, { status })} />
            <EntryToolbar
              index={index}
              count={items.length}
              onMove={(d) => onChange(move(items, index, d))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Section title" htmlFor={`${section.id}-title`}>
              <Input
                id={`${section.id}-title`}
                value={section.title}
                onChange={(e) => setItem(index, { title: e.target.value })}
              />
            </Field>
            <Field label="Kind" htmlFor={`${section.id}-kind`}>
              <Select
                id={`${section.id}-kind`}
                value={section.kind}
                onChange={(e) => setItem(index, { kind: e.target.value as AdditionalSection["kind"] })}
              >
                <option value="publications">Publications</option>
                <option value="awards">Awards</option>
                <option value="volunteer">Volunteer work</option>
                <option value="open_source">Open-source contributions</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Items</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setItem(index, {
                    items: [...section.items, { id: newId("item"), title: "", description: "", date: "", url: "" }],
                  })
                }
              >
                Add item
              </Button>
            </div>
            {section.items.map((item, itemIndex) => (
              <div key={item.id} className="mb-2 grid gap-2 md:grid-cols-[2fr_3fr_1fr_2fr_auto]">
                <Input
                  aria-label="Item title"
                  placeholder="Title"
                  value={item.title}
                  onChange={(e) =>
                    setItem(index, {
                      items: section.items.map((it, i) => (i === itemIndex ? { ...it, title: e.target.value } : it)),
                    })
                  }
                />
                <Input
                  aria-label="Item description"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) =>
                    setItem(index, {
                      items: section.items.map((it, i) =>
                        i === itemIndex ? { ...it, description: e.target.value } : it,
                      ),
                    })
                  }
                />
                <Input
                  aria-label="Item date"
                  placeholder="Date"
                  value={item.date}
                  onChange={(e) =>
                    setItem(index, {
                      items: section.items.map((it, i) => (i === itemIndex ? { ...it, date: e.target.value } : it)),
                    })
                  }
                />
                <Input
                  aria-label="Item URL"
                  placeholder="URL"
                  value={item.url}
                  onChange={(e) =>
                    setItem(index, {
                      items: section.items.map((it, i) => (i === itemIndex ? { ...it, url: e.target.value } : it)),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setItem(index, { items: section.items.filter((_, i) => i !== itemIndex) })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SectionCard>
  );
}
