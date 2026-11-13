import "server-only";
import { createHash, createPublicKey, randomBytes, randomUUID, verify, type JsonWebKey } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { AIProviderError } from "../types";

const issuer = "https://auth.openai.com";
export const chatgptResource = "https://api.openai.com/v1";
const registrationId = "dynamic_agent_client";
const requiredScopes = ["resource.invoke", "chatgpt.tokens.use.direct"];
const requestedScopes = ["openid", "profile", "email", "offline_access", ...requiredScopes].join(" ");
const attemptTtlMs = 15 * 60_000;
export const chatgptAttemptCookie = "cverixa_chatgpt_attempt";
const directory = join(process.cwd(), "data", "chatgpt");
const profilePath = join(directory, "connection.json");

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  token_type: z.string().regex(/^bearer$/i),
  scope: z.string(),
  expires_in: z.number().positive(),
});
const profileSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().min(1),
  email: z.string().optional(),
  credentials: tokensSchema.extend({ expiresAt: z.number() }).optional(),
});
type Profile = z.infer<typeof profileSchema>;
type Attempt = {
  ownerId: string;
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  expiresAt: number;
  clientId?: string;
  subject?: string;
};

const globalSession = globalThis as typeof globalThis & {
  cverixaChatGPT?: { attempt?: Attempt; busy: Promise<unknown> };
};
const runtime = (globalSession.cverixaChatGPT ??= { busy: Promise.resolve() });

export function chatgptOrigin(): string | null {
  const url = new URL(getEnv().APP_URL);
  return url.protocol === "http:" && url.hostname === "127.0.0.1" ? url.origin : null;
}

function readProfile(): Profile | undefined {
  try {
    return profileSchema.parse(JSON.parse(readFileSync(profilePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function saveProfile(profile: Profile) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, randomUUID());
  try {
    writeFileSync(temporary, JSON.stringify(profile), { mode: 0o600, flag: "wx" });
    renameSync(temporary, profilePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function hostId(): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "host-id");
  try {
    writeFileSync(path, `urn:uuid:${randomUUID()}`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFileSync(path, "utf8").trim();
}

export function chatgptConnection() {
  const profile = chatgptOrigin() ? readProfile() : undefined;
  return { connected: Boolean(profile?.credentials), email: profile?.email };
}

export function startChatGPTSignIn(ownerId: string) {
  const origin = chatgptOrigin();
  if (!origin) throw new Error("ChatGPT connection requires a local loopback address.");
  const profile = readProfile();
  const attempt: Attempt = {
    ownerId,
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    redirectUri: new URL("/auth/callback", origin).href,
    expiresAt: Date.now() + attemptTtlMs,
    clientId: profile?.clientId,
    subject: profile?.subject,
  };
  const url = new URL("/api/accounts/authorize", issuer);
  url.search = new URLSearchParams({
    client_id: attempt.clientId ?? registrationId,
    ext_agent_host_id: hostId(),
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope: requestedScopes,
    resource: chatgptResource,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
  }).toString();
  if (!profile) url.searchParams.set("agent_name_hint", "Cverixa");
  runtime.attempt = attempt;
  return { url, state: attempt.state, maxAge: attemptTtlMs / 1000 };
}

function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = runtime.busy.then(action, action);
  runtime.busy = next;
  // Background rejection is observed by the request that enqueued it.
  return next;
}

async function authFetch(url: string, init?: RequestInit) {
  return fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
}

async function requestTokens(parameters: Record<string, string>) {
  const response = await authFetch(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({ ...parameters, resource: chatgptResource }),
  });
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) {
      throw new AIProviderError("chatgpt", "provider_error", "ChatGPT sign-in is temporarily unavailable.", true);
    }
    throw new AIProviderError(
      "chatgpt",
      "auth",
      "ChatGPT authorization expired or was rejected. Connect again in AI Settings.",
    );
  }
  const tokens = tokensSchema.parse(await response.json());
  const scopes = new Set(tokens.scope.split(/\s+/));
  if (!requiredScopes.every((scope) => scopes.has(scope))) {
    throw new AIProviderError("chatgpt", "auth", "Allow ChatGPT plan usage to complete the connection.");
  }
  return { ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 };
}

const claimsSchema = z.object({
  iss: z.literal(issuer),
  aud: z.union([z.string(), z.array(z.string())]),
  azp: z.string().optional(),
  exp: z.number(),
  nonce: z.string(),
  sub: z.string().min(1),
  email: z.string().optional(),
});
const jwksSchema = z.object({ keys: z.array(z.object({ kid: z.string().optional() }).passthrough()) });
const rsaKeySchema = z.object({ kty: z.literal("RSA"), n: z.string(), e: z.string() });

async function discovery() {
  const response = await authFetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error("OpenAI identity metadata is unavailable.");
  return z
    .object({ issuer: z.literal(issuer), jwks_uri: z.url(), revocation_endpoint: z.url() })
    .parse(await response.json());
}

function authEndpoint(url: string) {
  if (new URL(url).origin !== issuer) throw new Error("Unexpected OpenAI identity endpoint.");
  return url;
}

async function verifyIdentity(token: string, clientId: string, nonce: string) {
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra !== undefined) throw new Error("Invalid ChatGPT identity token.");
  const metadata = z
    .object({ alg: z.literal("RS256"), kid: z.string() })
    .parse(JSON.parse(Buffer.from(header, "base64url").toString("utf8")));
  const response = await authFetch(authEndpoint((await discovery()).jwks_uri));
  if (!response.ok) throw new Error("OpenAI signing keys are unavailable.");
  const jwks = jwksSchema.parse(await response.json());
  const jwk = rsaKeySchema.safeParse(jwks.keys.find((key) => key.kid === metadata.kid));
  if (
    !jwk.success ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: jwk.data as JsonWebKey, format: "jwk" }),
      Buffer.from(signature, "base64url"),
    )
  ) {
    throw new Error("Invalid ChatGPT identity signature.");
  }
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !audiences.includes(clientId) ||
    (audiences.length > 1 && !claims.azp) ||
    (claims.azp && claims.azp !== clientId) ||
    claims.exp <= Date.now() / 1000 ||
    claims.nonce !== nonce
  ) {
    throw new Error("Invalid ChatGPT identity claims.");
  }
  return claims;
}

export async function finishChatGPTSignIn(ownerId: string, cookie: string | undefined, query: URLSearchParams) {
  const attempt = runtime.attempt;
  if (
    !attempt ||
    attempt.expiresAt <= Date.now() ||
    attempt.ownerId !== ownerId ||
    attempt.state !== cookie ||
    attempt.state !== query.get("state")
  )
    return "invalid";
  runtime.attempt = undefined;
  if (query.has("error")) return "denied";
  const code = query.get("code");
  const returnedId = query.get("client_id");
  const clientId = attempt.clientId ?? returnedId;
  if (!code || !clientId || clientId === registrationId || (returnedId && returnedId !== clientId)) return "invalid";

  return serialize(async () => {
    try {
      const credentials = await requestTokens({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: attempt.verifier,
        redirect_uri: attempt.redirectUri,
      });
      if (!credentials.id_token) return "failed";
      const identity = await verifyIdentity(credentials.id_token, clientId, attempt.nonce);
      if (attempt.subject && attempt.subject !== identity.sub) return "failed";
      saveProfile({ clientId, subject: identity.sub, email: identity.email, credentials });
      return "connected";
    } catch {
      return "failed";
    }
  });
}

export function getChatGPTAccessToken(): Promise<string> {
  return serialize(async () => {
    const profile = chatgptOrigin() ? readProfile() : undefined;
    const credentials = profile?.credentials;
    if (!profile || !credentials) {
      throw new AIProviderError("chatgpt", "not_configured", "Connect your ChatGPT plan in AI Settings.");
    }
    if (credentials.expiresAt > Date.now() + 60_000) return credentials.access_token;
    const refreshed = await requestTokens({
      grant_type: "refresh_token",
      client_id: profile.clientId,
      refresh_token: credentials.refresh_token,
    });
    saveProfile({ ...profile, credentials: { ...refreshed, id_token: refreshed.id_token ?? credentials.id_token } });
    return refreshed.access_token;
  });
}

export function disconnectChatGPT() {
  runtime.attempt = undefined;
  return serialize(async () => {
    const profile = readProfile();
    if (!profile?.credentials) return true;
    const { credentials, ...identity } = profile;
    let revoked = false;
    try {
      const url = authEndpoint((await discovery()).revocation_endpoint);
      revoked = (
        await authFetch(url, {
          method: "POST",
          body: new URLSearchParams({
            token: credentials.refresh_token,
            token_type_hint: "refresh_token",
            client_id: profile.clientId,
          }),
        })
      ).ok;
    } catch {
      // Clear the local session even when remote revocation cannot be confirmed.
    }
    saveProfile(identity);
    return revoked;
  });
}
