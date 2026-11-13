import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

it("verifies a loopback callback, saves protected OAuth credentials, and revokes them on disconnect", async () => {
  const root = mkdtempSync(join(tmpdir(), "cverixa-chatgpt-test-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.stubEnv("APP_URL", "http://127.0.0.1:3001");
  try {
    const session = await import("@/server/ai/chatgpt/session");
    cwd.mockRestore();
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { url, state } = session.startChatGPTSignIn("owner");
    expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3001/auth/callback");

    const params = new URLSearchParams({ state, code: "test-code", client_id: "oaiapp_test" });
    const issuer = "https://auth.openai.com";
    const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({
        iss: issuer,
        aud: "oaiapp_test",
        nonce: url.searchParams.get("nonce"),
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: "test-account",
        email: "owner@example.test",
      }),
    ).toString("base64url");
    const payload = `${jwtHeader}.${claims}`;
    const jwt = `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
    const mockFetch = vi.fn(async (endpoint: string, init?: RequestInit) => {
      if (endpoint.endsWith("/oauth/token")) {
        const form = new URLSearchParams(init?.body as URLSearchParams);
        expect(form.get("client_id")).toBe("oaiapp_test");
        expect(form.get("resource")).toBe("https://api.openai.com/v1");
        expect(createHash("sha256").update(form.get("code_verifier")!).digest("base64url")).toBe(
          url.searchParams.get("code_challenge"),
        );
        return Response.json({
          access_token: "test-access",
          refresh_token: "test-refresh",
          id_token: jwt,
          token_type: "Bearer",
          scope: "resource.invoke chatgpt.tokens.use.direct offline_access",
          expires_in: 3600,
        });
      }
      if (endpoint.endsWith("/openid-configuration")) {
        return Response.json({ issuer, jwks_uri: `${issuer}/jwks`, revocation_endpoint: `${issuer}/revoke` });
      }
      if (endpoint.endsWith("/jwks")) {
        return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key" }] });
      }
      expect(endpoint).toBe(`${issuer}/revoke`);
      expect(new URLSearchParams(init?.body as URLSearchParams).get("token")).toBe("test-refresh");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(session.finishChatGPTSignIn("another-owner", state, params)).resolves.toBe("invalid");
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(session.finishChatGPTSignIn("owner", state, params)).resolves.toBe("connected");
    await expect(session.finishChatGPTSignIn("owner", state, params)).resolves.toBe("invalid");
    expect(session.chatgptConnection()).toEqual({ connected: true, email: "owner@example.test" });
    await expect(session.getChatGPTAccessToken()).resolves.toBe("test-access");
    const path = join(root, "data", "chatgpt", "connection.json");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(session.disconnectChatGPT()).resolves.toBe(true);
    expect(readFileSync(path, "utf8")).not.toContain("test-refresh");
    expect(session.startChatGPTSignIn("owner").url.searchParams.get("client_id")).toBe("oaiapp_test");
  } finally {
    cwd.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  }
});
