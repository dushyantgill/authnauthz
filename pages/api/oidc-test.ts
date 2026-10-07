import type { NextApiRequest, NextApiResponse } from "next";
import {
  createHash,
  randomBytes,
  createHmac,
  createPublicKey,
} from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { tenantId, origin, issuer, required } from "../../lib/config";
import { archetypes } from "../../lib/archetypes";
import { store } from "../../lib/store";
import { headers, escape, equal } from "../../lib/security";
import { testClientId, testCallback } from "../../lib/test-clients";
function sign(s: string) {
  return createHmac("sha256", required("COOKIE_SECRET"))
    .update(s)
    .digest("base64url");
}
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px/1.6 system-ui;background:#f1f7eb;color:#19231e;max-width:900px;margin:40px auto;padding:24px}main{background:white;padding:28px;border-radius:16px}a{color:inherit}a.button{display:inline-block;background:#a3e635;padding:12px 20px;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8f4;padding:16px}</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`;
}
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  );
  let t = "realestate";
  try {
    t = tenantId(String(req.query.tenant || "realestate"));
    if (req.method !== "GET") return res.status(405).end();
    const cookie = "authnauthz_oidc_test_" + t;
    const cookieFlags = `Path=/api/oidc-test; HttpOnly; SameSite=Lax${origin().startsWith("https:") ? "; Secure" : ""}`;
    const again = "/api/oidc-test?tenant=" + t;
    if (req.query.callback !== "1") {
      const state = randomBytes(24).toString("base64url"),
        nonce = randomBytes(24).toString("base64url"),
        verifier = randomBytes(32).toString("base64url");
      await store().mutate(t, (s) => {
        s.models["OIDCTest:" + state] = {
          payload: { nonce, verifier },
          expires: Date.now() + 600000,
        };
      });
      res.setHeader(
        "Set-Cookie",
        `${cookie}=${state}.${sign(state)}; ${cookieFlags}; Max-Age=600`,
      );
      const url = new URL(issuer(t) + "/auth");
      url.search = new URLSearchParams({
        client_id: testClientId(t),
        redirect_uri: testCallback(t),
        response_type: "code",
        scope: "openid profile email groups",
        state,
        nonce,
        prompt: "login",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      return res.send(
        page(
          archetypes[tenantId(t)].name + " OIDC / OAuth test",
          `<p>Test Authorization Code with PKCE (S256), using a directory username and shared simulator password.</p><a class="button" href="${escape(url.href)}">Start OIDC / OAuth sign-in →</a><p>The callback verifies state, nonce, ID token signature, issuer, audience and expiry, then calls UserInfo. No client secret is needed for this public test client.</p><details><summary>Authorization request</summary><pre>${escape(url.href)}</pre></details>`,
        ),
      );
    }
    const query = new URL(req.url!, origin()).searchParams;
    for (const name of ["state", "code", "error", "callback", "tenant"])
      if (query.getAll(name).length > 1)
        throw Error("Duplicate callback parameter");
    const state = query.get("state") || "",
      raw = req.cookies[cookie] || "";
    if (!state || !equal(raw, state + "." + sign(state)))
      throw Error(
        "Callback does not match this browser's test request. Start again.",
      );
    const pending = await store().mutate(t, (s) => {
      const entry = s.models["OIDCTest:" + state];
      if (!entry || entry.expires <= Date.now())
        throw Error("Expired or already used test request");
      delete s.models["OIDCTest:" + state];
      return entry.payload;
    });
    res.setHeader("Set-Cookie", `${cookie}=; ${cookieFlags}; Max-Age=0`);
    if (query.has("error"))
      throw Error("Authorization declined: " + query.get("error"));
    const code = query.get("code");
    if (!code) throw Error("Missing authorization code");
    const tokenResponse = await fetch(issuer(t) + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: testClientId(t),
        redirect_uri: testCallback(t),
        code,
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token || !tokens.access_token)
      throw Error(
        "Token exchange failed: " + (tokens.error || tokenResponse.status),
      );
    const keys = JSON.parse(required("OIDC_JWKS")).keys.map((key: any) => ({
      ...createPublicKey({ key, format: "jwk" }).export({ format: "jwk" }),
      kid: key.kid,
      alg: key.alg,
      use: "sig",
    }));
    const { payload } = await jwtVerify(
      tokens.id_token,
      createLocalJWKSet({ keys }),
      {
        issuer: issuer(t),
        audience: testClientId(t),
        algorithms: ["RS256"],
        requiredClaims: ["sub", "iat", "exp", "nonce"],
      },
    );
    if (payload.nonce !== pending.nonce) throw Error("ID token nonce mismatch");
    if (
      payload.at_hash !== undefined &&
      payload.at_hash !==
        createHash("sha256")
          .update(tokens.access_token)
          .digest()
          .subarray(0, 16)
          .toString("base64url")
    )
      throw Error("Access token hash mismatch");
    const userResponse = await fetch(issuer(t) + "/me", {
      headers: { Authorization: "Bearer " + tokens.access_token },
      signal: AbortSignal.timeout(20000),
    });
    const user = await userResponse.json();
    if (!userResponse.ok || user.sub !== payload.sub)
      throw Error("UserInfo subject mismatch");
    return res.send(
      page(
        "OIDC / OAuth sign-in succeeded",
        `<p>Authorization Code + PKCE, browser state, ID token signature, issuer, audience, expiry, nonce, access-token hash and UserInfo subject passed validation.</p><h2>Verified ID token claims</h2><pre>${escape(JSON.stringify(payload, null, 2))}</pre><h2>UserInfo</h2><pre>${escape(JSON.stringify(user, null, 2))}</pre><p>Access token lifetime: ${escape(tokens.expires_in)} seconds. Scope: ${escape(tokens.scope || "")}</p><a class="button" href="${again}">Run another test</a>`,
      ),
    );
  } catch (e) {
    return res
      .status(400)
      .send(
        page(
          "OIDC / OAuth test could not complete",
          `<p>${escape(e instanceof Error ? e.message : "Invalid callback")}</p><a href="/api/oidc-test?tenant=${escape(t)}">Start a fresh test</a>`,
        ),
      );
  }
}
