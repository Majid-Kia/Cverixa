import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser, renderPdf } from "@/features/resume-rendering/pdf";
import { DocumentImportError, extractDocumentText } from "@/server/document-processing";
import { mockImport } from "@/server/ai/providers/mock";
import { profileImportAiOutputSchema } from "@/server/ai/schemas/profile-import";
import { normalizeImportedProfile } from "@/features/career-profile/normalize";

const RESUME_TEXT = `Jordan Example
jordan@example.com | +1 555 010 2030 | Berlin
Senior Backend Engineer at Globex (2019 - Present)
- Designed PostgreSQL schemas and Node.js services handling 2M requests per day
- Introduced Docker based CI pipelines
Backend Engineer at Initech (2015 - 2019)
- Built Python data pipelines`;

const limits = { maxFileSizeBytes: 10 * 1024 * 1024, maxPages: 10 };

async function makePdf(text: string): Promise<Uint8Array> {
  const html = `<!doctype html><html><body><pre style="font-family: Arial; font-size: 12pt">${text.replace(/</g, "&lt;")}</pre></body></html>`;
  return (await renderPdf(html, "A4")).pdf;
}

async function makeDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const paragraphs = text
    .split("\n")
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("document import (FR-001)", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it("extracts text from a text-based PDF", async () => {
    const pdf = await makePdf(RESUME_TEXT);
    const result = await extractDocumentText(pdf, "resume.pdf", limits);
    expect(result.fileType).toBe("pdf");
    expect(result.pages).toBe(1);
    expect(result.text).toContain("Jordan Example");
    expect(result.text).toContain("Globex");
  });

  it("extracts text from a DOCX", async () => {
    const docx = await makeDocx(RESUME_TEXT);
    const result = await extractDocumentText(docx, "resume.docx", limits);
    expect(result.fileType).toBe("docx");
    expect(result.text).toContain("Jordan Example");
    expect(result.text).toContain("PostgreSQL");
  });

  it("rejects a PDF with no extractable text", async () => {
    const pdf = await makePdf("");
    await expect(extractDocumentText(pdf, "blank.pdf", limits)).rejects.toMatchObject({ code: "no_text" });
  });

  it("rejects documents exceeding the page limit", async () => {
    const pdf = await makePdf(Array.from({ length: 3 }, (_, i) => `Page ${i}\n${"line\n".repeat(80)}`).join("\n"));
    await expect(extractDocumentText(pdf, "long.pdf", { ...limits, maxPages: 1 })).rejects.toMatchObject({
      code: "too_many_pages",
    });
  });

  it("rejects corrupted and mislabelled files", async () => {
    const corrupted = new TextEncoder().encode("%PDF-1.4 this is not really a pdf");
    await expect(extractDocumentText(corrupted, "bad.pdf", limits)).rejects.toBeInstanceOf(DocumentImportError);
    const docx = await makeDocx(RESUME_TEXT);
    await expect(extractDocumentText(docx, "renamed.pdf", limits)).rejects.toMatchObject({
      code: "unsupported_format",
    });
  });

  it("produces a reviewable draft profile from extracted text through the mock converter", async () => {
    const docx = await makeDocx(RESUME_TEXT);
    const extracted = await extractDocumentText(docx, "resume.docx", limits);
    const output = profileImportAiOutputSchema.parse(mockImport(extracted.text));
    const profile = normalizeImportedProfile(output);
    expect(profile.personal.fullName).toBe("Jordan Example");
    expect(profile.personal.email).toBe("jordan@example.com");
    expect(profile.experience.map((entry) => entry.employer)).toEqual(["Globex", "Initech"]);
    expect(profile.experience[0].startDate).toBe("2019");
    expect(profile.experience[0].endDate).toBe("");
    expect(profile.experience[0].achievements[0].text).toContain("2M requests per day");
    expect(profile.experience[0].status).toBe("imported");
    expect(profile.skills.some((skill) => skill.name === "postgresql")).toBe(true);
  });
});
