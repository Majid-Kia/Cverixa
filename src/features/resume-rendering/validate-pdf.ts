import { extractText, getDocumentProxy } from "unpdf";

export interface PdfValidationResult {
  ok: boolean;
  pageCount: number;
  textLength: number;
  interEmbedded: boolean;
  /** Names of fonts referenced by the PDF (from font dictionaries). */
  fontNames: string[];
  problems: string[];
}

/**
 * Stage 8 quality validation for an exported PDF: text must be extractable,
 * Inter must be embedded and the expected content must be present.
 */
export async function validateResumePdf(
  pdfBytes: Uint8Array,
  expectations: { mustContain: string[]; maxPages?: number },
): Promise<PdfValidationResult> {
  const problems: string[] = [];
  const document = await getDocumentProxy(new Uint8Array(pdfBytes));
  const pageCount = document.numPages;
  const { text } = await extractText(document, { mergePages: true });
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) problems.push("No extractable text found in the PDF.");
  for (const expected of expectations.mustContain) {
    const needle = expected.replace(/\s+/g, " ").trim();
    if (needle && !normalized.toLowerCase().includes(needle.toLowerCase())) {
      problems.push(`Expected text not found in PDF: "${needle.slice(0, 60)}".`);
    }
  }
  if (expectations.maxPages && pageCount > expectations.maxPages) {
    problems.push(`PDF has ${pageCount} pages; expected at most ${expectations.maxPages}.`);
  }

  const fontNames = extractFontNames(pdfBytes);
  const interEmbedded = fontNames.some((name) => /inter/i.test(name));
  if (!interEmbedded) problems.push("Inter font is not embedded in the PDF.");
  const nonInter = fontNames.filter((name) => !/inter/i.test(name));
  if (nonInter.length > 0) problems.push(`Unexpected fonts referenced: ${nonInter.join(", ")}.`);

  return { ok: problems.length === 0, pageCount, textLength: normalized.length, interEmbedded, fontNames, problems };
}

/** Collect /BaseFont names from the raw PDF bytes (works for uncompressed font dictionaries, which Chromium emits). */
export function extractFontNames(pdfBytes: Uint8Array): string[] {
  const raw = Buffer.from(pdfBytes).toString("latin1");
  const names = new Set<string>();
  const pattern = /\/BaseFont\s*\/([^\s/>\]]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    names.add(match[1].replace(/^[A-Z]{6}\+/, ""));
  }
  return [...names];
}
