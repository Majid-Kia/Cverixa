import { arbeitnowSource } from "./arbeitnow";
import { ashbySource } from "./ashby";
import { euresSource, IMPORT_HOSTS, indeedSource, linkedinSource, welcomeToTheJungleSource } from "./external-links";
import { greenhouseSource } from "./greenhouse";
import { leverSource } from "./lever";
import { remotiveSource } from "./remotive";
import type { AutomaticSource, JobSource, LinkOnlySource } from "./types";

/**
 * Every job source the scanner knows. Adding a source means adding an adapter
 * here; the scan pipeline, settings and history work from this list and have
 * no knowledge of any particular source.
 */
export const AUTOMATIC_SOURCES: AutomaticSource[] = [
  arbeitnowSource,
  greenhouseSource,
  ashbySource,
  leverSource,
  remotiveSource,
] as AutomaticSource[];

export const LINK_ONLY_SOURCES: LinkOnlySource[] = [
  linkedinSource,
  indeedSource,
  euresSource,
  welcomeToTheJungleSource,
];

export const JOB_SOURCES: JobSource[] = [...AUTOMATIC_SOURCES, ...LINK_ONLY_SOURCES];

/** Source id given to postings the owner imported from a site without an adapter. */
export const MANUAL_SOURCE_ID = "manual";

export function getAutomaticSource(id: string): AutomaticSource | null {
  return AUTOMATIC_SOURCES.find((source) => source.id === id) ?? null;
}

export function sourceLabel(id: string): string {
  if (id === MANUAL_SOURCE_ID) return "Imported";
  return (
    JOB_SOURCES.find((source) => source.id === id)?.displayName ??
    IMPORT_HOSTS.find((host) => host.sourceId === id)?.label ??
    id
  );
}

/** The source a manually imported posting belongs to, from the host of its URL. */
export function sourceIdForHost(hostname: string): string {
  return IMPORT_HOSTS.find((host) => host.pattern.test(hostname))?.sourceId ?? MANUAL_SOURCE_ID;
}
