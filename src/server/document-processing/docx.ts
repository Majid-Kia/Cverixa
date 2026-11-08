import mammoth from "mammoth";
import { normalizeExtractedText, type ExtractedDocument } from "./pdf";
import { DocumentImportError } from "./validate-upload";

const MIN_TEXT_LENGTH = 40;

/** Extract raw text from a DOCX file using mammoth. */
export async function extractDocxText(buffer: Uint8Array): Promise<ExtractedDocument> {
  let result;
  try {
    result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  } catch {
    throw new DocumentImportError(
      "corrupted",
      "The Word document could not be read. It may be corrupted or password-protected.",
    );
  }
  const text = normalizeExtractedText(result.value ?? "");
  if (text.length < MIN_TEXT_LENGTH) {
    throw new DocumentImportError("no_text", "The Word document contains no readable text.");
  }
  const estimatedPages = Math.max(1, Math.ceil(text.length / 3000));
  return { text, pages: estimatedPages };
}
