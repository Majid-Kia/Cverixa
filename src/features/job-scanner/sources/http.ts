/**
 * The only way a source adapter reaches the network. Every request is bound to
 * the adapter's host allow-list, so a value from configuration or from a
 * source's response can never redirect the server to another host
 * (server-side request forgery). Requests are counted against the adapter's
 * per-scan budget, time out, and are retried with backoff on transient errors.
 */

export class SourceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SourceRequestError";
  }
}

export interface SourceHttpOptions {
  allowedHosts: string[];
  maxRequests: number;
  timeoutMs: number;
  /** Additional attempts after the first for 429, 5xx and network failures. */
  retries?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface SourceHttp {
  /** GET a JSON document from an allow-listed host. */
  getJson(url: string): Promise<unknown>;
  /** Requests made so far, including retries. */
  readonly requestCount: number;
}

const USER_AGENT = "Cverixa-JobScanner/1.0 (personal job search tool)";
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createSourceHttp(options: SourceHttpOptions): SourceHttp {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const retries = options.retries ?? 2;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_BYTES;
  const allowed = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  let requestCount = 0;

  const assertAllowed = (raw: string): URL => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new SourceRequestError("The source request URL is not valid.");
    }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      throw new SourceRequestError("Source requests must use https on the standard port.");
    }
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new SourceRequestError(`Requests to ${url.hostname} are not allowed for this source.`);
    }
    return url;
  };

  const attempt = async (url: URL): Promise<unknown> => {
    if (requestCount >= options.maxRequests) {
      throw new SourceRequestError(`The request limit for this source (${options.maxRequests} per scan) was reached.`);
    }
    requestCount += 1;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        // A redirect could point anywhere; sources are called at their documented URLs only.
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new SourceRequestError(
        timedOut
          ? `The source did not answer within ${Math.round(options.timeoutMs / 1000)} seconds.`
          : "The source could not be reached.",
        null,
        true,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new SourceRequestError("The source answered with a redirect, which is not followed.", response.status);
    }
    if (response.status === 404) throw new SourceRequestError("Not found at the source (404).", 404);
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const error = new SourceRequestError(
        response.status === 429
          ? "The source is rate limiting requests (429)."
          : `The source answered with a server error (${response.status}).`,
        response.status,
        true,
      );
      (error as SourceRequestError & { retryAfterMs?: number }).retryAfterMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : undefined;
      throw error;
    }
    if (!response.ok) {
      throw new SourceRequestError(`The source refused the request (${response.status}).`, response.status);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new SourceRequestError("The source response is larger than the allowed size.");
    }
    const body = await response.text();
    if (body.length > maxBytes) throw new SourceRequestError("The source response is larger than the allowed size.");
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new SourceRequestError("The source did not return valid JSON.");
    }
  };

  return {
    get requestCount() {
      return requestCount;
    },
    async getJson(raw: string): Promise<unknown> {
      const url = assertAllowed(raw);
      let lastError: unknown;
      for (let tryIndex = 0; tryIndex <= retries; tryIndex += 1) {
        try {
          return await attempt(url);
        } catch (error) {
          lastError = error;
          if (!(error instanceof SourceRequestError) || !error.retryable || tryIndex === retries) throw error;
          const retryAfterMs = (error as SourceRequestError & { retryAfterMs?: number }).retryAfterMs;
          await sleep(retryAfterMs ?? 500 * 3 ** tryIndex);
        }
      }
      throw lastError;
    },
  };
}

/** Message safe to store and show for any failure inside a source adapter. */
export function sourceErrorMessage(error: unknown): string {
  if (error instanceof SourceRequestError) return error.message;
  if (error instanceof Error && error.name === "ZodError") return "The source returned data in an unexpected shape.";
  return "The source failed unexpectedly.";
}
