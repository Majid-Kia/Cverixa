/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mask a secret for display, keeping only the last few characters. */
export function maskSecret(value: string | undefined | null, visible = 4): string {
  if (!value) return "not configured";
  if (value.length <= visible) return "****";
  return `********${value.slice(-visible)}`;
}

/** Truncate text for lists without leaking long content. */
export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
