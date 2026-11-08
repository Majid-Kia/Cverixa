import { classicClearTemplate } from "./classic-clear";
import { engineeringModernTemplate } from "./engineering-modern";
import { jakeInspiredTemplate } from "./jake-inspired";
import type { ResumeTemplate, TemplateId } from "./shared";

export type { ResumeTemplate, TemplateId, TemplateRenderOptions } from "./shared";

export const TEMPLATES: readonly ResumeTemplate[] = [
  classicClearTemplate,
  jakeInspiredTemplate,
  engineeringModernTemplate,
];

export const DEFAULT_TEMPLATE_ID: TemplateId = "classic-clear";

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

/** Resolve a template by id, falling back to the default for unknown ids. */
export function getTemplate(id: string | null | undefined): ResumeTemplate {
  return TEMPLATES.find((template) => template.id === id) ?? classicClearTemplate;
}

export function templateOptions(): Array<{ id: TemplateId; name: string; description: string }> {
  return TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}
