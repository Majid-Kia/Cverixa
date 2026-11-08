import { extractText, getDocumentProxy } from "unpdf";
import { DocumentImportError } from "./validate-upload";

export interface ExtractedDocument {
  text: string;
  pages: number;
}

const MIN_TEXT_LENGTH = 40;

/** Extract text from a text-based PDF. Scanned and encrypted PDFs are rejected. */
export async function extractPdfText(buffer: Uint8Array, maxPages: number): Promise<ExtractedDocument> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (name === "PasswordException" || /password/i.test(message)) {
      throw new DocumentImportError(
        "password_protected",
        "The PDF is password-protected. Remove the password and try again.",
      );
    }
    throw new DocumentImportError("corrupted", "The PDF could not be read. It may be corrupted or not a real PDF.");
  }
  const pages = pdf.numPages;
  if (pages > maxPages) {
    throw new DocumentImportError("too_many_pages", `The document has ${pages} pages; the limit is ${maxPages}.`);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  const cleaned = normalizeExtractedText(text);
  if (cleaned.length < MIN_TEXT_LENGTH) {
    throw new DocumentImportError(
      "no_text",
      "No extractable text was found. Scanned or image-only PDFs are not supported; export a text-based PDF instead.",
    );
  }
  return { text: cleaned, pages };
}

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
