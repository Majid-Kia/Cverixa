import { z } from "zod";
import { sourceErrorMessage, SourceRequestError } from "./http";
import type { BoardRef, SourceJob } from "./types";

/** Company identifiers go into a URL path, so only a conservative character set is accepted. */
const SLUG = /^[a-z0-9][a-z0-9._-]{0,60}$/i;

export const MAX_BOARDS = 40;

/** Parse "slug" or "slug | Company name" lines. Invalid lines are dropped. */
export function parseBoards(value: string): BoardRef[] {
  const boards = new Map<string, BoardRef>();
  for (const line of value.split(/[\n,;]+/)) {
    const [rawSlug, ...rest] = line.split("|");
    const slug = rawSlug.trim();
    if (!SLUG.test(slug)) continue;
    const name = rest.join("|").trim().slice(0, 100) || prettyName(slug);
    if (!boards.has(slug.toLowerCase())) boards.set(slug.toLowerCase(), { slug, name });
  }
  return [...boards.values()].slice(0, MAX_BOARDS);
}

export function formatBoards(boards: BoardRef[]): string {
  return boards
    .map((board) => (board.name === prettyName(board.slug) ? board.slug : `${board.slug} | ${board.name}`))
    .join("\n");
}

function prettyName(slug: string): string {
  return slug
    .replace(/[-_.]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
}

export const boardsConfigSchema = z.object({
  boards: z
    .array(z.object({ slug: z.string().regex(SLUG), name: z.string().trim().min(1).max(100) }))
    .max(MAX_BOARDS)
    .default([]),
});
export type BoardsConfig = z.infer<typeof boardsConfigSchema>;

export const boards = (...entries: Array<string | [string, string]>): BoardRef[] =>
  entries.map((entry) =>
    typeof entry === "string" ? { slug: entry, name: prettyName(entry) } : { slug: entry[0], name: entry[1] },
  );

/**
 * Fetch several company boards one after another. A board that fails (renamed,
 * closed, temporarily down) is reported as a warning and the others continue;
 * the source as a whole fails only when every board failed.
 */
export async function collectBoards(
  list: BoardRef[],
  fetchBoard: (board: BoardRef) => Promise<SourceJob[]>,
): Promise<{ jobs: SourceJob[]; warnings: string[] }> {
  const jobs: SourceJob[] = [];
  const warnings: string[] = [];
  let failed = 0;
  let firstError: unknown = null;
  for (const board of list) {
    try {
      jobs.push(...(await fetchBoard(board)));
    } catch (error) {
      failed += 1;
      firstError = firstError ?? error;
      warnings.push(`${board.name} (${board.slug}): ${sourceErrorMessage(error)}`);
    }
  }
  if (list.length > 0 && failed === list.length) {
    throw new SourceRequestError(
      `All ${list.length} company boards failed. First: ${warnings[0]}`,
      firstError instanceof SourceRequestError ? firstError.status : null,
    );
  }
  return { jobs, warnings };
}
