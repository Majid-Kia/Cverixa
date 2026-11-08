import { extractDocxText } from "./docx";
import { extractPdfText, type ExtractedDocument } from "./pdf";
import { validateUpload, type SupportedFileType, type UploadLimits } from "./validate-upload";

export { DocumentImportError } from "./validate-upload";
export type { SupportedFileType, UploadLimits } from "./validate-upload";

export interface ImportedDocument extends ExtractedDocument {
  fileType: SupportedFileType;
}

/**
 * Validate an uploaded resume and extract its text. Uploaded content is
 * treated as untrusted: it is never executed, only parsed as text.
 */
export async function extractDocumentText(
  buffer: Uint8Array,
  fileName: string,
  limits: UploadLimits,
): Promise<ImportedDocument> {
  const fileType = validateUpload(buffer, fileName, limits);
  const extracted = fileType === "pdf" ? await extractPdfText(buffer, limits.maxPages) : await extractDocxText(buffer);
  return { ...extracted, fileType };
}
