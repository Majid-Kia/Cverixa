/**
 * Minimal structured logger. Callers must never pass resume contents, job
 * description text, credentials or session tokens (see docs/architecture.md).
 */
type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, string | number | boolean | null | undefined>;

const REDACTED_KEYS = /key|secret|token|password|authorization|cookie/i;

function sanitize(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = REDACTED_KEYS.test(key) ? "[redacted]" : value;
  }
  return out;
}

function write(level: Level, message: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const entry = { level, message, time: new Date().toISOString(), ...sanitize(fields) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
