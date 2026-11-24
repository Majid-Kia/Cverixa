import { createHash } from "node:crypto";
import { normalizeTerm } from "@/features/job-analysis/keywords";
import { SCAN_LIMITS } from "./constants";
import { normalizePlace } from "./countries";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  bull: "-",
  middot: "-",
  euro: "EUR",
  pound: "GBP",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, digits: string) => codePoint(Number.parseInt(digits, 10)))
    .replace(/&([a-zA-Z]{2,8});/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

function codePoint(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return "";
  // Control characters have no place in a job description.
  if (value < 32 && value !== 10 && value !== 9) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function stripMarkup(html: string): string {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(script|style|noscript|template|iframe|svg)\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|section|article|ul|ol|table|tr|h[1-6]|blockquote)\s*>/gi, "\n\n")
      .replace(/<(p|div|section|article|h[1-6]|tr)\b[^>]*>/gi, "\n")
      // Inline markup sits inside words and sentences; removing it must not add spaces.
      .replace(/<\/?(strong|em|b|i|u|span|a|code|small|mark|sup|sub|font)\b[^>]*>/gi, "")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
  );
}

const HAS_MARKUP = /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i;

/**
 * Convert a source's HTML description to plain text. Scripts, styles and all
 * markup are removed; paragraphs and list items become lines. The result is
 * only ever rendered as text, so nothing in a posting can run in the browser.
 *
 * Sources escape their HTML inconsistently: Greenhouse returns it entity-escaped
 * ("&lt;p&gt;") and some boards escape it twice, so markup can reappear after
 * entities are decoded. Stripping and decoding therefore repeat until no markup
 * is left (a bounded number of times).
 */
export function htmlToText(html: string): string {
  let text = html;
  for (let pass = 0; pass < 4; pass += 1) {
    text = decodeEntities(stripMarkup(text));
    if (!HAS_MARKUP.test(text)) break;
  }
  return cleanText(stripMarkup(text));
}

/** Normalise whitespace and cap the length of posting text. */
export function cleanText(text: string): string {
  return text
    .toWellFormed()
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n-\s*\n+/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, SCAN_LIMITS.maxDescriptionLength);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash of the posting text an analysis was produced from. */
export function descriptionHash(text: string): string {
  return sha256(text.replace(/\s+/g, " ").trim().toLowerCase());
}

const COMPANY_SUFFIX =
  /\b(gmbh|ag|se|inc|llc|ltd|limited|plc|bv|b\.v\.|nv|ab|as|a\/s|oy|sa|sas|srl|spa|group|holding|holdings|corp|corporation|co|company|technologies|technology|labs)\b\.?/g;

/** Gender markers and requisition noise that vary between copies of the same posting. */
const TITLE_NOISE =
  /\((?:[mfwdx]\s*[/|]\s*){1,3}[mfwdx*]\)|\ball genders\b|\(all genders\)|\b(m\/f\/d|m\/w\/d|f\/m\/x|f\/m\/d|w\/m\/d)\b/gi;

export function normalizeCompany(company: string): string {
  return normalizePlace(company)
    .replace(COMPANY_SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return normalizeTerm(title.replace(TITLE_NOISE, " "))
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/**
 * Signature of a job independent of where it was found: the same company,
 * title and place give the same key on every source.
 */
export function buildDedupeKey(input: {
  company: string;
  title: string;
  countryCode: string | null;
  city: string | null;
}) {
  const place = [input.countryCode ?? "", input.city ? normalizePlace(input.city) : ""].join(":");
  return sha256(`${normalizeCompany(input.company)}|${normalizeTitle(input.title)}|${place}`).slice(0, 40);
}

const TRACKING_PARAMS = /^(utm_[a-z]+|gh_src|gh_jid|source|src|ref|referrer|lever-source(\[\])?|trk|trackingid)$/i;

/**
 * Accept only absolute http(s) URLs without credentials and return them in a
 * canonical form (no fragment, no tracking parameters). Returns null for
 * anything else, so a `javascript:` or `data:` link from a source is dropped.
 */
export function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  const text = url.toString();
  return text.length <= 2000 ? text : null;
}

const FILLER = new Set(["focused", "based", "level", "role", "position", "the", "a", "an", "of", "and", "for", "in"]);

const TOKEN_SYNONYMS: Record<string, string> = {
  developer: "engineer",
  dev: "engineer",
  programmer: "engineer",
  sr: "senior",
  "sr.": "senior",
  jr: "junior",
  fe: "frontend",
  ui: "frontend",
  reactjs: "react",
  "react.js": "react",
  lead: "lead",
  entwickler: "engineer",
  entwicklerin: "engineer",
};

function titleTokens(value: string): string[] {
  return normalizeTitle(value)
    .split(" ")
    .map((token) => TOKEN_SYNONYMS[token] ?? token)
    .filter((token) => token.length > 0 && !FILLER.has(token));
}

/**
 * Which of the owner's job titles and keywords a listing title matches. A
 * keyword matches when every one of its words is in the title, in any order:
 * "Frontend Engineer" matches "Senior Front-End Software Developer (React)".
 */
export function matchKeywords(title: string, keywords: string[]): string[] {
  const tokens = new Set(titleTokens(title));
  const contains = (phrase: string) => {
    const wanted = titleTokens(phrase);
    return wanted.length > 0 && wanted.every((token) => tokens.has(token));
  };
  // A line that starts with "-" excludes: "-React Native" drops mobile roles that "React Engineer" would match.
  if (keywords.filter(isExclusion).some((keyword) => contains(keyword.slice(1)))) return [];
  return keywords.filter((keyword) => !isExclusion(keyword) && contains(keyword));
}

/** Whether a keyword line is an exclusion ("-React Native") instead of a title to look for. */
export function isExclusion(keyword: string): boolean {
  return keyword.trim().startsWith("-");
}
