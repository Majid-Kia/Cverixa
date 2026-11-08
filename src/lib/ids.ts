/** Stable, collision-resistant identifiers for structured content entries. */
export function newId(prefix?: string): string {
  const raw = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${raw}` : raw;
}
