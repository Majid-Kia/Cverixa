import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Bundled Inter font faces (SIL Open Font License, see public/fonts/LICENSE-Inter-OFL.txt).
 * Fonts are embedded as data URIs so rendering never depends on installed
 * fonts or network access (PRD 12.1).
 */
const WEIGHTS = [400, 500, 600, 700] as const;

let cachedCss: string | null = null;

export function fontsDirectory(): string {
  return path.join(process.cwd(), "public", "fonts");
}

export function interFontFaceCss(): string {
  if (cachedCss) return cachedCss;
  const faces = WEIGHTS.map((weight) => {
    const file = path.join(fontsDirectory(), `inter-latin-${weight}-normal.woff2`);
    const data = readFileSync(file).toString("base64");
    return `@font-face { font-family: "Inter"; font-style: normal; font-weight: ${weight}; font-display: block; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  });
  cachedCss = faces.join("\n");
  return cachedCss;
}
