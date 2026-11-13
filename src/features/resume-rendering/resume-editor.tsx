"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { saveRevisionAction } from "@/features/resume-history/actions";
import { initialActionState } from "@/lib/action-result";
import { newId } from "@/lib/ids";
import {
  DEFAULT_SECTION_ORDER,
  SECTION_LABELS,
  type PageFormat,
  type ResumeBullet,
  type ResumeContent,
  type ResumeSectionKey,
} from "@/types/resume-content";

interface Props {
  resumeId: string;
  revision: { id: string; version: number; templateId: string; pageFormat: PageFormat; content: ResumeContent };
  templates: Array<{ id: string; name: string; description: string }>;
}

const ZOOMS = [0.6, 0.8, 1, 1.25];

/**
 * Live editor + preview (FR-009). The preview is rendered by the same server
 * templates used for the PDF; the exported PDF remains the final authority.
 */
export function ResumeEditor({ resumeId, revision, templates }: Props) {
  const [content, setContent] = useState<ResumeContent>(revision.content);
  const [templateId, setTemplateId] = useState(revision.templateId);
  const [pageFormat, setPageFormat] = useState<PageFormat>(revision.pageFormat);
  const [zoom, setZoom] = useState(0.8);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layout, setLayout] = useState<{ pageCount: number; warnings: string[] } | null>(null);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [state, action] = useActionState(saveRevisionAction, initialActionState);
  const [checkedSaved, setCheckedSaved] = useState(false);
  const dirty =
    JSON.stringify(content) !== JSON.stringify(revision.content) ||
    templateId !== revision.templateId ||
    pageFormat !== revision.pageFormat;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview refresh (NFR-004).
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/resumes/${resumeId}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, templateId, pageFormat }),
        });
        if (!response.ok) throw new Error(await response.text());
        setPreviewHtml(await response.text());
        setPreviewError(null);
      } catch (error) {
        setPreviewError(error instanceof Error && error.message ? error.message : "Preview failed.");
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [content, templateId, pageFormat, resumeId]);

  const runPdfCheck = async (input: { content: ResumeContent; templateId: string; pageFormat: PageFormat }) => {
    try {
      const response = await fetch(`/api/resumes/${resumeId}/layout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as { pageCount?: number; warnings?: string[]; error?: string };
      if (data.pageCount !== undefined) setLayout({ pageCount: data.pageCount, warnings: data.warnings ?? [] });
      else setLayout({ pageCount: 0, warnings: [data.error ?? "PDF check failed."] });
    } catch {
      setLayout({ pageCount: 0, warnings: ["PDF check failed."] });
    } finally {
      setLayoutBusy(false);
    }
  };
  const checkLayout = () => {
    setLayoutBusy(true);
    void runPdfCheck({ content, templateId, pageFormat });
  };

  // Check the saved version's PDF once when it is opened, so a nearly empty last page, a repeated
  // skill label or a headline mismatch is visible before the PDF is downloaded.
  const savedRevision = useRef(revision);
  useEffect(() => {
    const saved = savedRevision.current;
    const timer = setTimeout(() => {
      void runPdfCheck({ content: saved.content, templateId: saved.templateId, pageFormat: saved.pageFormat }).then(
        () => setCheckedSaved(true),
      );
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per opened version (the editor is keyed by revision id)
  }, []);

  const sectionOrder: ResumeSectionKey[] = [
    ...content.sectionOrder,
    ...DEFAULT_SECTION_ORDER.filter((key) => !content.sectionOrder.includes(key)),
  ];
  const moveSection = (key: ResumeSectionKey, direction: -1 | 1) => {
    const index = sectionOrder.indexOf(key);
    const target = index + direction;
    if (target < 0 || target >= sectionOrder.length) return;
    const next = [...sectionOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setContent({ ...content, sectionOrder: next });
  };
  const toggleSection = (key: ResumeSectionKey) =>
    setContent({
      ...content,
      hiddenSections: content.hiddenSections.includes(key)
        ? content.hiddenSections.filter((k) => k !== key)
        : [...content.hiddenSections, key],
    });

  const updateBullets = (kind: "experience" | "projects", entryId: string, bullets: ResumeBullet[]) =>
    setContent({
      ...content,
      [kind]: content[kind].map((entry) => (entry.id === entryId ? { ...entry, bullets } : entry)),
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <form action={action} className="space-y-3">
            <input type="hidden" name="resumeId" value={resumeId} />
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="pageFormat" value={pageFormat} />
            <input type="hidden" name="content" value={JSON.stringify(content)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Template" htmlFor="template">
                <Select id="template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Page format" htmlFor="format">
                <Select
                  id="format"
                  value={pageFormat}
                  onChange={(event) => setPageFormat(event.target.value as PageFormat)}
                >
                  <option value="A4">A4</option>
                  <option value="Letter">US Letter</option>
                </Select>
              </Field>
              <Field label="Preview zoom" htmlFor="zoom">
                <Select id="zoom" value={String(zoom)} onChange={(event) => setZoom(Number(event.target.value))}>
                  {ZOOMS.map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-muted text-xs">
              {templates.find((template) => template.id === templateId)?.description}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton disabled={!dirty} pendingLabel="Saving...">
                Save as new version
              </SubmitButton>
              <Button variant="secondary" onClick={checkLayout} disabled={layoutBusy}>
                {layoutBusy ? "Checking PDF..." : "Check pagination"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setContent(revision.content);
                  setTemplateId(revision.templateId);
                  setPageFormat(revision.pageFormat);
                }}
                disabled={!dirty}
              >
                Discard changes
              </Button>
              {layout ? (
                <span className="text-sm">
                  {layout.pageCount > 0 ? `${layout.pageCount} page${layout.pageCount === 1 ? "" : "s"} in PDF` : null}
                </span>
              ) : null}
            </div>
            {layout && layout.pageCount > 0 && layout.warnings.length === 0 ? (
              <p className="text-muted text-xs" data-testid="pdf-check-ok">
                PDF check passed{checkedSaved && !dirty ? " for this version" : ""}: no nearly empty last page, repeated
                skill labels or headline mismatch.
              </p>
            ) : null}
            {layout?.warnings.length ? (
              <Alert tone="warning" title="PDF check">
                <ul className="list-disc pl-5">
                  {layout.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
            {dirty ? (
              <p className="text-warning text-xs">Unsaved changes. Download uses the last saved version.</p>
            ) : null}
          </form>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Sections</h3>
          <ul className="space-y-1 text-sm">
            {sectionOrder.map((key, index) => (
              <li key={key} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={!content.hiddenSections.includes(key)}
                    onChange={() => toggleSection(key)}
                    aria-label={`Show ${SECTION_LABELS[key]}`}
                  />
                  {SECTION_LABELS[key]}
                </label>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(key, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${SECTION_LABELS[key]} up`}
                  >
                    Up
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(key, 1)}
                    disabled={index === sectionOrder.length - 1}
                    aria-label={`Move ${SECTION_LABELS[key]} down`}
                  >
                    Down
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Header</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="ed-name">
              <Input
                id="ed-name"
                value={content.personal.fullName}
                onChange={(e) =>
                  setContent({ ...content, personal: { ...content.personal, fullName: e.target.value } })
                }
              />
            </Field>
            <Field label="Headline" htmlFor="ed-headline">
              <Input
                id="ed-headline"
                value={content.personal.headline}
                onChange={(e) =>
                  setContent({ ...content, personal: { ...content.personal, headline: e.target.value } })
                }
              />
            </Field>
          </div>
          <Field label="Summary" htmlFor="ed-summary" className="mt-3">
            <Textarea
              id="ed-summary"
              value={content.summary.text}
              onChange={(e) => setContent({ ...content, summary: { ...content.summary, text: e.target.value } })}
            />
          </Field>
        </Card>

        {content.featured ? (
          <Card>
            <h3 className="mb-2 font-semibold">Selected project</h3>
            <p className="text-muted mb-2 text-xs">
              Shown under the summary so it lands on page one. Taken from {content.featured.subtitle || "your profile"};
              these bullets are not repeated elsewhere.
            </p>
            <Field label="Project title" htmlFor="ed-featured-title">
              <Input
                id="ed-featured-title"
                value={content.featured.title}
                onChange={(e) =>
                  setContent({
                    ...content,
                    featured: content.featured && { ...content.featured, title: e.target.value },
                  })
                }
              />
            </Field>
            <BulletList
              bullets={content.featured.bullets}
              onChange={(bullets) =>
                setContent({ ...content, featured: content.featured && { ...content.featured, bullets } })
              }
            />
          </Card>
        ) : null}

        <Card>
          <h3 className="mb-2 font-semibold">Experience bullets</h3>
          {content.experience.map((entry) => (
            <div key={entry.id} className="border-border mb-4 rounded-md border p-3">
              <p className="font-medium">
                {entry.title} <span className="text-muted">· {entry.employer}</span>
              </p>
              <BulletList
                bullets={entry.bullets}
                onChange={(bullets) => updateBullets("experience", entry.id, bullets)}
              />
            </div>
          ))}
          {content.projects.length ? <h3 className="mt-4 mb-2 font-semibold">Project bullets</h3> : null}
          {content.projects.map((project) => (
            <div key={project.id} className="border-border mb-4 rounded-md border p-3">
              <p className="font-medium">{project.name}</p>
              <BulletList
                bullets={project.bullets}
                onChange={(bullets) => updateBullets("projects", project.id, bullets)}
              />
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Skills order</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {content.skills.map((skill, index) => (
              <li key={skill.id} className="border-border flex items-center gap-1 rounded-full border px-2 py-1">
                <span>{skill.name}</span>
                <button
                  type="button"
                  className="text-muted hover:text-foreground text-xs"
                  aria-label={`Move ${skill.name} earlier`}
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...content.skills];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    setContent({ ...content, skills: next });
                  }}
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-foreground text-xs"
                  aria-label={`Move ${skill.name} later`}
                  disabled={index === content.skills.length - 1}
                  onClick={() => {
                    const next = [...content.skills];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    setContent({ ...content, skills: next });
                  }}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="text-danger text-xs"
                  aria-label={`Remove ${skill.name}`}
                  onClick={() => setContent({ ...content, skills: content.skills.filter((s) => s.id !== skill.id) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card className="p-2">
          <div className="text-muted mb-2 flex items-center justify-between px-2 text-xs">
            <span>Live preview (same template as the PDF; pagination shown by &ldquo;Check pagination&rdquo;)</span>
            <span>Version {revision.version}</span>
          </div>
          {previewError ? <Alert tone="danger">{previewError}</Alert> : null}
          <div className="h-[75vh] overflow-auto rounded bg-slate-200">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                width: `${100 / zoom}%`,
                height: `${100 / zoom}%`,
              }}
            >
              <iframe title="Resume preview" srcDoc={previewHtml} sandbox="" className="h-full w-full border-0" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BulletList({ bullets, onChange }: { bullets: ResumeBullet[]; onChange: (bullets: ResumeBullet[]) => void }) {
  return (
    <ul className="mt-2 space-y-2">
      {bullets.map((bullet, index) => (
        <li key={bullet.id} className="flex items-start gap-2">
          <Textarea
            aria-label={`Bullet ${index + 1}`}
            value={bullet.text}
            onChange={(event) =>
              onChange(bullets.map((b) => (b.id === bullet.id ? { ...b, text: event.target.value } : b)))
            }
            className="min-h-12 flex-1"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move bullet up"
              disabled={index === 0}
              onClick={() => {
                const next = [...bullets];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              Up
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move bullet down"
              disabled={index === bullets.length - 1}
              onClick={() => {
                const next = [...bullets];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onChange(next);
              }}
            >
              Down
            </Button>
            <Button
              size="sm"
              variant="danger"
              aria-label="Remove bullet"
              onClick={() => onChange(bullets.filter((b) => b.id !== bullet.id))}
            >
              Remove
            </Button>
          </div>
        </li>
      ))}
      <li>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange([...bullets, { id: newId("b"), text: "", sourceIds: [], kind: "original" }])}
        >
          Add bullet
        </Button>
      </li>
    </ul>
  );
}
