import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/security/password";
import { RateLimiter } from "@/server/security/rate-limit";
import { detectFileType, DocumentImportError, validateUpload } from "@/server/document-processing/validate-upload";
import { maskSecret } from "@/lib/utils";

describe("password hashing", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("CorrectHorse42Battery");
    expect(hash).not.toContain("CorrectHorse");
    expect(await verifyPassword("CorrectHorse42Battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("enforces password strength", () => {
    expect(validatePasswordStrength("short")).toMatch(/12 characters/);
    expect(validatePasswordStrength("alllowercaseletters")).toMatch(/upper-case/);
    expect(validatePasswordStrength("CorrectHorse42Battery")).toBeNull();
  });
});

describe("login rate limiter", () => {
  it("blocks after the limit within the window and resets afterwards", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect(limiter.check("b").allowed).toBe(true);
    now = 1001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("can be reset explicitly", () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("upload validation (content, not extension)", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%fake");
  const zipBytes = new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04,
    ...new TextEncoder().encode("......word/document.xml......"),
  ]);
  const limits = { maxFileSizeBytes: 1024, maxPages: 10 };

  it("detects real file types", () => {
    expect(detectFileType(pdfBytes, "cv.pdf")).toBe("pdf");
    expect(detectFileType(zipBytes, "cv.docx")).toBe("docx");
  });

  it("rejects mismatched extensions and unknown content", () => {
    expect(detectFileType(pdfBytes, "cv.docx")).toBeNull();
    expect(detectFileType(zipBytes, "cv.pdf")).toBeNull();
    expect(detectFileType(new TextEncoder().encode("hello"), "cv.pdf")).toBeNull();
    expect(detectFileType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]), "cv.docx")).toBeNull();
  });

  it("throws actionable errors for empty, oversized and unsupported uploads", () => {
    expect(() => validateUpload(new Uint8Array(), "cv.pdf", limits)).toThrowError(DocumentImportError);
    expect(() => validateUpload(new Uint8Array(2048), "cv.pdf", limits)).toThrow(/upload limit/);
    expect(() => validateUpload(new TextEncoder().encode("plain text"), "cv.txt", limits)).toThrow(/Unsupported file/);
    expect(validateUpload(pdfBytes, "cv.pdf", limits)).toBe("pdf");
  });
});

describe("secret masking", () => {
  it("never reveals more than the suffix", () => {
    expect(maskSecret("sk-abcdef123456")).toBe("********3456");
    expect(maskSecret("")).toBe("not configured");
  });
});
