export type SupportedFileType = "pdf" | "docx";

export class DocumentImportError extends Error {
  constructor(
    readonly code:
      "unsupported_format" | "too_large" | "empty" | "corrupted" | "password_protected" | "no_text" | "too_many_pages",
    message: string,
  ) {
    super(message);
    this.name = "DocumentImportError";
  }
}

export interface UploadLimits {
  maxFileSizeBytes: number;
  maxPages: number;
}

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Identify the document type from its content, never from the extension alone. */
export function detectFileType(buffer: Uint8Array, fileName: string): SupportedFileType | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const head = Buffer.from(buffer.subarray(0, 1024)).toString("latin1");
  if (head.startsWith(PDF_MAGIC)) return extension === "pdf" ? "pdf" : null;
  const isZip = ZIP_MAGIC.every((byte, index) => buffer[index] === byte);
  if (isZip) {
    const text = Buffer.from(buffer).toString("latin1");
    const looksLikeWord = text.includes("word/document.xml") || text.includes("word/_rels");
    return looksLikeWord && extension === "docx" ? "docx" : null;
  }
  return null;
}

/** Validate size, emptiness and real content type. Throws DocumentImportError. */
export function validateUpload(buffer: Uint8Array, fileName: string, limits: UploadLimits): SupportedFileType {
  if (buffer.byteLength === 0) {
    throw new DocumentImportError("empty", "The uploaded file is empty.");
  }
  if (buffer.byteLength > limits.maxFileSizeBytes) {
    const limitMb = Math.round(limits.maxFileSizeBytes / (1024 * 1024));
    throw new DocumentImportError("too_large", `The file exceeds the ${limitMb} MB upload limit.`);
  }
  const type = detectFileType(buffer, fileName);
  if (!type) {
    throw new DocumentImportError(
      "unsupported_format",
      "Unsupported file. Upload a text-based PDF (.pdf) or a Word document (.docx) whose content matches its extension.",
    );
  }
  return type;
}
