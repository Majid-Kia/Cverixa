import { chromium, type Browser } from "playwright";
import type { PageFormat } from "@/types/resume-content";

export interface LayoutWarning {
  code: "horizontal_overflow" | "empty_document";
  message: string;
}

export interface PdfRenderResult {
  pdf: Uint8Array;
  layoutWarnings: LayoutWarning[];
  durationMs: number;
}

const globalForBrowser = globalThis as unknown as { resumeBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  if (!globalForBrowser.resumeBrowser) {
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
    globalForBrowser.resumeBrowser = chromium
      .launch({ headless: true, executablePath, args: ["--font-render-hinting=none"] })
      .then((browser) => {
        browser.on("disconnected", () => {
          globalForBrowser.resumeBrowser = undefined;
        });
        return browser;
      })
      .catch((error) => {
        globalForBrowser.resumeBrowser = undefined;
        throw error;
      });
  }
  return globalForBrowser.resumeBrowser;
}

export async function closeBrowser(): Promise<void> {
  const pending = globalForBrowser.resumeBrowser;
  globalForBrowser.resumeBrowser = undefined;
  if (pending) {
    const browser = await pending.catch(() => null);
    await browser?.close();
  }
}

/**
 * Render print HTML to PDF with server-side Chromium. The page is loaded from
 * a string with no network access; fonts are embedded in the HTML.
 */
export async function renderPdf(html: string, pageFormat: PageFormat): Promise<PdfRenderResult> {
  const started = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false, offline: false });
  try {
    await context.route("**/*", (route) => {
      // Only the inline document is allowed; block any external request.
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    const layoutWarnings = await page.evaluate(() => {
      const warnings: Array<{ code: "horizontal_overflow" | "empty_document"; message: string }> = [];
      const root = document.documentElement;
      if (root.scrollWidth > root.clientWidth + 1) {
        warnings.push({ code: "horizontal_overflow", message: "Content is wider than the page and may be clipped." });
      }
      if (!document.body.innerText.trim()) {
        warnings.push({ code: "empty_document", message: "The document has no text content." });
      }
      return warnings;
    });

    const pdf = await page.pdf({
      format: pageFormat === "Letter" ? "Letter" : "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
    });
    return { pdf: new Uint8Array(pdf), layoutWarnings, durationMs: Date.now() - started };
  } finally {
    await context.close();
  }
}
