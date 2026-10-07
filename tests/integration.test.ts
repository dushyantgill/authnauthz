import { beforeAll, afterAll, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, createLocalJWKSet } from "jose";
import * as saml from "samlify";
import { parseXml } from "../lib/federation";
let server: ChildProcess;
let logs = "";
const base = "http://localhost:3100",
  issuer = base + "/api/t/realestate/oidc",
  scim = base + "/api/t/realestate/scim";
const secret = "integration-secret-with-at-least-thirty-two-characters";
const jar = new Map<string, string>();
async function http(url: string, init: RequestInit = {}, cookies = false) {
  const headers = new Headers(init.headers);
  if (cookies && jar.size)
    headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const r = await fetch(url.startsWith("http") ? url : base + url, {
    ...init,
    headers,
    redirect: "manual",
  });
  if (cookies)
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  return r;
}
async function admin(path: string, method = "GET", data?: unknown) {
  return http("/api/admin/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function provision(
  path: string,
  method = "GET",
  data?: unknown,
  extra: Record<string, string> = {},
) {
  return http(scim + "/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.SCIM_TOKEN,
      "Content-Type": "application/scim+json",
      ...extra,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
beforeAll(async () => {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3100"],
    {
      env: { ...process.env, WATCHPACK_POLLING: "true", TEST_SERVER: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const pipe of [server.stdout, server.stderr])
    pipe?.on("data", (c) => (logs += c.toString()));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await http("/");
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Server failed to start: " + logs);
});
afterAll(() => {
  server?.kill("SIGTERM");
});
it("serves the dashboard and protects administration and tenant routes", async () => {
  expect((await http("/")).status).toBe(200);
  expect((await http("/api/admin/directory")).status).toBe(401);
  expect((await http("/api/t/another/scim/Users")).status).toBe(503);
  expect((await admin("directory")).status).toBe(200);
});
it("supports discovery and a complete PKCE login, consent, userinfo, refresh, introspection and revocation flow", async () => {
  const config = {
    persona: "generic",
    clients: [
      {
        client_id: "public-test",
        redirect_uris: [base + "/callback"],
        post_logout_redirect_uris: [base + "/"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      {
        client_id: "service-test",
        client_secret: secret,
        redirect_uris: [base + "/callback"],
        grant_types: ["client_credentials"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
      },
    ],
    samlApps: [],
    wsfedApps: [],
  };
  const saved = await admin("config", "PUT", config);
  expect(saved.status, await saved.text()).toBe(200);
  const discovery = await (
    await http(issuer + "/.well-known/openid-configuration")
  ).json();
  expect(discovery.issuer).toBe(issuer);
  expect(discovery.code_challenge_methods_supported).toContain("S256");
  expect(discovery.response_types_supported).toEqual(["code"]);
  const jwks = await (await http(discovery.jwks_uri)).json();
  expect(jwks.keys[0].d).toBeUndefined();
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    client_id: "public-test",
    redirect_uri: base + "/callback",
    response_type: "code",
    scope: "openid profile email groups offline_access",
    state: "client-state",
    nonce: "client-nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  const auth = await http(discovery.authorization_endpoint + "?" + q, {}, true);
  expect(auth.status, await auth.text()).toBe(303);
  const loginUrl = new URL(auth.headers.get("location")!, base).href;
  const login = await (await http(loginUrl, {}, true)).text();
  const csrf = login.match(/name="csrf" value="([^"]+)"/)?.[1],
    account = (await (await admin("directory")).json()).users[0].id;
  expect(csrf).toBeTruthy();
  let r = await http(
    loginUrl,
    {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        csrf: csrf!,
        username: (await (await admin("directory")).json()).users.find(
          (u: any) => u.id === account,
        ).userName,
        password: readFileSync(".simulation-password", "utf8").trim(),
        action: "approve",
      }),
    },
    true,
  );
  expect(r.status, await r.text()).toBe(303);
  r = await http(new URL(r.headers.get("location")!, base).href, {}, true);
  expect(r.status).toBe(303);
  const consentUrl = new URL(r.headers.get("location")!, base).href;
  const html = await (await http(consentUrl, {}, true)).text();
  const consentCsrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  expect(consentCsrf, html).toBeTruthy();
  r = await http(
    consentUrl,
    {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf: consentCsrf!, action: "approve" }),
    },
    true,
  );
  expect(r.status, await r.text()).toBe(303);
  r = await http(new URL(r.headers.get("location")!, base).href, {}, true);
  expect(r.status, await r.text()).toBe(303);
  const callback = new URL(r.headers.get("location")!, base);
  expect(callback.searchParams.get("state")).toBe("client-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();
  const tokenRequest = new URLSearchParams({
    grant_type: "authorization_code",
    code: code!,
    client_id: "public-test",
    redirect_uri: base + "/callback",
    code_verifier: verifier,
  });
  r = await http(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenRequest,
  });
  const tokens = await r.json();
  expect(r.status, JSON.stringify(tokens)).toBe(200);
  expect(tokens.refresh_token).toBeTruthy();
  const jwt = await jwtVerify(tokens.id_token, createLocalJWKSet(jwks), {
    issuer,
    audience: "public-test",
  });
  expect(jwt.payload.nonce).toBe("client-nonce");
  expect(jwt.payload.sub).toBe(account);
  const user = await (
    await http(discovery.userinfo_endpoint, {
      headers: { Authorization: "Bearer " + tokens.access_token },
    })
  ).json();
  expect(user.sub).toBe(account);
  expect(user.groups.length).toBeGreaterThan(0);

  const refresh = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: "public-test",
  });
  r = await http(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refresh,
  });
  const rotated = await r.json();
  expect(r.status, JSON.stringify(rotated)).toBe(200);
  expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
  r = await http(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refresh,
  });
  expect(r.status).toBe(400);
  r = await http(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenRequest,
  });
  expect(r.status).toBe(400);
  const basic =
    "Basic " + Buffer.from("service-test:" + secret).toString("base64");
  r = await http(discovery.token_endpoint, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "openid",
    }),
  });
  const cc = await r.json();
  expect(r.status, JSON.stringify(cc)).toBe(200);
  r = await http(discovery.introspection_endpoint, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: cc.access_token }),
  });
  expect((await r.json()).active).toBe(true);
  r = await http(discovery.revocation_endpoint, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: cc.access_token }),
  });
  expect(r.status).toBe(200);
  r = await http(discovery.introspection_endpoint, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: cc.access_token }),
  });
  expect((await r.json()).active).toBe(false);
  const bad = new URLSearchParams(q);
  bad.set("redirect_uri", "https://evil.example/callback");
  r = await http(discovery.authorization_endpoint + "?" + bad);
  expect(r.status).toBe(400);
  expect(r.headers.get("location")).toBeNull();
});
it("performs authenticated SCIM CRUD, filtering, pagination, projection, PATCH and ETag conflict detection", async () => {
  expect((await http(scim + "/Users")).status).toBe(401);
  let r = await provision("Users?count=0");
  expect((await r.json()).totalResults).toBe(267);
  r = await provision(
    "Users?filter=" +
      encodeURIComponent('userType eq "Contractor"') +
      "&count=2&startIndex=2&attributes=userName",
  );
  const list = await r.json();
  expect(list.totalResults).toBe(29);
  expect(list.Resources).toHaveLength(2);
  expect(list.Resources[0].title).toBeUndefined();
  expect(list.Resources[0].userName).toBeTruthy();
  r = await provision("Users", "POST", {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: "scim-test@example.com",
    displayName: "SCIM Test",
    active: true,
    emails: [{ type: "work", value: "old@example.com" }],
  });
  const created = await r.json();
  expect(r.status, JSON.stringify(created)).toBe(201);
  const etag = r.headers.get("etag")!;
  r = await provision(
    "Users/" + created.id,
    "PATCH",
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [
        {
          op: "replace",
          path: 'emails[type eq "work"].value',
          value: "new@example.com",
        },
      ],
    },
    { "If-Match": etag },
  );
  expect(r.status, await r.clone().text()).toBe(200);
  expect((await r.json()).emails[0].value).toBe("new@example.com");
  r = await provision("Users/" + created.id, "DELETE", undefined, {
    "If-Match": etag,
  });
  expect(r.status).toBe(412);
  r = await provision("Users/" + created.id, "DELETE");
  expect(r.status).toBe(204);
  expect((await provision("Users/" + created.id)).status).toBe(404);
  expect((await provision("Users?filter=bad!")).status).toBe(400);
  expect((await provision("Schemas")).status).toBe(200);
});
it("rejects invalid SAML requests, XML entities, replay and unregistered WS-Fed reply URLs", async () => {
  const metadata = await (await http("/api/t/realestate/saml/metadata")).text();
  expect(metadata).toContain("Signature");
  const ws = await (await http("/api/t/realestate/wsfed/metadata")).text();
  expect(ws).toContain("SecurityTokenServiceType");
  const sp = saml.ServiceProvider({
    entityID: "https://rp.example.com/saml",
    authnRequestsSigned: true,
    wantAssertionsSigned: true,
    wantLogoutResponseSigned: true,
    singleLogoutService: [
      {
        Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
        Location: base + "/slo-callback",
      },
    ],
    privateKey: process.env.SAML_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    signingCert: process.env.SAML_CERTIFICATE!.replace(/\\n/g, "\n"),
    assertionConsumerService: [
      {
        Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        Location: base + "/acs",
      },
    ],
  });
  const idp = saml.IdentityProvider({
    metadata,
    wantLogoutRequestSigned: true,
  });
  const old = await (await admin("config")).json();
  old.samlApps = [
    {
      id: "sp",
      name: "SP",
      metadata: sp.getMetadata(),
      requireSignedRequests: true,
      encryptAssertions: false,
    },
  ];
  old.wsfedApps = [
    {
      id: "ws",
      name: "WS",
      realm: "https://rp.example.com",
      replyUrl: base + "/ws-callback",
      tokenType: "saml11",
    },
  ];
  expect((await admin("config", "PUT", old)).status).toBe(200);
  const request = sp.createLoginRequest(idp, "redirect", { relayState: "abc" });
  let r = await http(String(request.context));
  expect([302, 303, 307]).toContain(r.status);
  const formUrl = new URL(r.headers.get("location")!, base).href;
  const login = await (await http(formUrl, {}, true)).text();
  const csrf = login.match(/name="csrf" value="([^"]+)"/)?.[1],
    account = (await (await admin("directory")).json()).users[0].id;
  const signed = await http(
    formUrl,
    {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        csrf: csrf!,
        username: (await (await admin("directory")).json()).users.find(
          (u: any) => u.id === account,
        ).userName,
        password: readFileSync(".simulation-password", "utf8").trim(),
      }),
    },
    true,
  );
  const signedHtml = await signed.text();
  expect(signed.status, signedHtml).toBe(200);
  const encoded = signedHtml.match(/name="SAMLResponse" value="([^"]+)"/)?.[1];
  expect(encoded).toBeTruthy();
  const parsed = await sp.parseLoginResponse(idp, "post", {
    body: { SAMLResponse: encoded },
  });
  expect(parsed.extract.nameID).toBe("danj@summitridge.example");
  const responseDoc = parseXml(Buffer.from(encoded!, "base64").toString());
  expect(
    responseDoc.getElementsByTagNameNS(
      "http://www.w3.org/2000/09/xmldsig#",
      "Signature",
    ).length,
  ).toBe(2);
  const sessionIndex = responseDoc
    .getElementsByTagNameNS(
      "urn:oasis:names:tc:SAML:2.0:assertion",
      "AuthnStatement",
    )
    .item(0)!
    .getAttribute("SessionIndex")!;
  r = await http(String(request.context));
  expect(r.status).toBe(400);
  const evil = new URL(String(request.context));
  evil.searchParams.set("Signature", "broken");
  expect((await http(evil.href)).status).toBe(400);
  const xml = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>';
  expect(
    (
      await http("/api/t/realestate/saml/sso", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SAMLRequest: Buffer.from(xml).toString("base64"),
        }),
      })
    ).status,
  ).toBe(400);
  r = await http(
    "/api/t/realestate/wsfed?" +
      new URLSearchParams({
        wa: "wsignin1.0",
        wtrealm: "https://rp.example.com",
        wreply: "https://evil.example",
      }),
  );
  expect(r.status).toBe(400);
  r = await http(
    "/api/t/realestate/wsfed?" +
      new URLSearchParams({
        wa: "wsignin1.0",
        wtrealm: "https://rp.example.com",
      }),
    {},
    true,
  );
  expect(r.status, await r.clone().text()).toBe(200);
  const html = await r.text();
  expect(html).toContain('name="wresult"');
  expect(html).toContain('name="wctx"');
  const logout = sp.createLogoutRequest(idp, "redirect", {
    logoutNameID: String(parsed.extract.nameID),
    sessionIndex,
  });
  const logoutResult = await http(String(logout.context), {}, true);
  expect([302, 307], await logoutResult.clone().text()).toContain(
    logoutResult.status,
  );
  const logoutUrl = new URL(logoutResult.headers.get("location")!);
  const raw = logoutUrl.search.slice(1);
  const octetString = raw
    .split("&")
    .filter((x) => !x.startsWith("Signature="))
    .join("&");
  const verified = await sp.parseLogoutResponse(idp, "redirect", {
    query: Object.fromEntries(logoutUrl.searchParams),
    octetString,
  });
  expect(verified.extract.response).toBeTruthy();
  expect((await http(String(logout.context))).status).toBe(400);
});
it("persists domains, retains stable IDs, rejects cross-origin changes, and stores only a test-password hash", async () => {
  const before = await (await admin("directory")).json();
  const domains = {
    employee: "officelore.example",
    contractor: "partners.example",
  };
  expect((await admin("domains", "PUT", domains)).status).toBe(200);
  const saved = await (await admin("config")).json();
  expect(saved.accountDomains).toEqual(domains);
  const after = await (await admin("directory")).json();
  expect(after.users.map((u: any) => u.id)).toEqual(
    before.users.map((u: any) => u.id),
  );
  expect(after.groups).toEqual(before.groups);
  expect(
    after.users
      .filter((u: any) => u.userType === "Employee")
      .every((u: any) => u.userName.endsWith("@officelore.example")),
  ).toBe(true);
  const rejected = await http("/api/admin/domains", {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + process.env.ADMIN_TOKEN,
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({
      employee: "evil.example",
      contractor: "evil.example",
    }),
  });
  expect(rejected.status).toBe(403);
  expect((await (await admin("config")).json()).accountDomains).toEqual(
    domains,
  );
  expect(
    (await admin("password", "PUT", { password: "Test@User1" })).status,
  ).toBe(200);
  const status = await (await admin("status")).json();
  expect(status.simulationPasswordConfigured).toBe(true);
  const configText = await (await admin("config")).text();
  expect(configText).not.toContain("Test@User1");
  expect(configText).not.toContain("sharedCredential");
  expect(
    (await admin("reset", "POST", { confirm: "RESET SUMMIT RIDGE" })).status,
  ).toBe(200);
  expect((await (await admin("directory")).json()).users[0].userName).toContain(
    "@officelore.example",
  );
});
it("runs the reusable SAML test through login and verified ACS, then rejects replay", async () => {
  const { testMetadata } = await import("../lib/saml-test");
  const c = await (await admin("config")).json();
  c.samlApps = c.samlApps.filter((a: any) => a.id !== "realestate-saml-test");
  c.samlApps.push({
    id: "realestate-saml-test",
    name: "Real Estate SAML Test",
    metadata: testMetadata(),
    requireSignedRequests: false,
    encryptAssertions: false,
  });
  expect((await admin("config", "PUT", c)).status).toBe(200);
  const launch = await http("/api/saml-test", {}, true);
  expect(launch.headers.get("content-type")).toContain("text/html");
  const page = await launch.text();
  expect(launch.status, page).toBe(200);
  const request = page.match(/name="SAMLRequest" value="([^"]+)"/)![1];
  const start = await http(
    "/api/t/realestate/saml/sso",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SAMLRequest: request,
        RelayState: "realestate-saml-test",
      }),
    },
    true,
  );
  expect(start.status, await start.clone().text()).toBe(303);
  const loginUrl = new URL(start.headers.get("location")!, base).href;
  const loginPage = await http(loginUrl, {}, true);
  expect(loginPage.headers.get("content-type")).toContain("text/html");
  const form = await loginPage.text();
  const csrf = form.match(/name="csrf" value="([^"]+)"/)![1];
  const username = (await (await admin("directory")).json()).users[0].userName;
  const result = await http(
    loginUrl,
    {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf, username, password: "Test@User1" }),
    },
    true,
  );
  expect(result.headers.get("content-type")).toContain("text/html");
  const html = await result.text();
  expect(result.status, html).toBe(200);
  const encoded = html.match(/name="SAMLResponse" value="([^"]+)"/)![1];
  const response = await http(
    "/api/saml-test",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ SAMLResponse: encoded }),
    },
    true,
  );
  expect(response.headers.get("content-type")).toContain("text/html");
  const verified = await response.text();
  expect(response.status, verified).toBe(200);
  expect(verified).toContain("SAML SSO succeeded");
  expect(verified).toContain(username);
  expect(
    (
      await http(
        "/api/saml-test",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ SAMLResponse: encoded }),
        },
        true,
      )
    ).status,
  ).toBe(400);
});

for (const tenant of ["realestate", "biotech", "insurance"]) {
  it(`runs the browser OIDC/OAuth test with PKCE and verifies ${tenant} claims`, async () => {
    expect(
      (
        await admin("password?tenant=" + tenant, "PUT", {
          password: "Test@User1",
        })
      ).status,
    ).toBe(200);
    const directory = await (await admin("directory?tenant=" + tenant)).json();
    const launch = await http("/api/oidc-test?tenant=" + tenant, {}, true);
    expect(launch.headers.get("content-type")).toContain("text/html");
    const html = await launch.text();
    const url = html
      .match(/href="([^"]+)"[^>]*>Start OIDC/)![1]
      .replaceAll("&amp;", "&");
    const bad = await http(
      "/api/oidc-test?tenant=" + tenant + "&callback=1&state=wrong&code=fake",
      {},
      true,
    );
    expect(bad.status).toBe(400);
    let result = await http(url, {}, true),
      callback = "";
    for (let i = 0; i < 15; i++) {
      if (result.status >= 300 && result.status < 400) {
        const target = new URL(result.headers.get("location")!, base).href;
        if (target.includes("/api/oidc-test")) callback = target;
        result = await http(target, {}, true);
      } else {
        const body = await result.clone().text();
        if (body.includes("OIDC / OAuth sign-in succeeded")) break;
        const csrf = body.match(/name="csrf" value="([^"]+)"/)?.[1];
        expect(csrf, body).toBeTruthy();
        expect(result.headers.get("content-type")).toContain("text/html");
        expect(body).not.toContain("AuthNAuthZ");
        const action = body
          .match(/<form[^>]+action="([^"]+)"/)![1]
          .replaceAll("&amp;", "&");
        result = await http(
          action,
          {
            method: "POST",
            headers: {
              Origin: base,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              csrf: csrf!,
              action: "approve",
              username: directory.users[0].userName,
              password: "Test@User1",
            }),
          },
          true,
        );
      }
    }
    const body = await result.text();
    expect(result.status, body).toBe(200);
    expect(body).toContain("OIDC / OAuth sign-in succeeded");
    expect(body).toContain(directory.users[0].id);
    expect(body).toContain("/api/t/" + tenant + "/oidc");
    expect(callback).toBeTruthy();
    expect((await http(callback, {}, true)).status).toBe(400);
  });
}
for (const tenant of ["biotech", "insurance"]) {
  it(`serves tenant-isolated SCIM and signed SAML test for ${tenant}`, async () => {
    const d = await (await admin("directory?tenant=" + tenant)).json();
    const users = await http("/api/t/" + tenant + "/scim/Users", {
      headers: { Authorization: "Bearer " + process.env.SCIM_TOKEN },
    });
    expect(users.status).toBe(200);
    expect((await users.json()).totalResults).toBe(267);
    expect(
      (
        await http(scim + "/Users/" + d.users[0].id, {
          headers: { Authorization: "Bearer " + process.env.SCIM_TOKEN },
        })
      ).status,
    ).toBe(404);
    const launch = await (
      await http("/api/saml-test?tenant=" + tenant, {}, true)
    ).text();
    const request = launch.match(/name="SAMLRequest" value="([^"]+)"/)![1];
    const start = await http(
      "/api/t/" + tenant + "/saml/sso",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ SAMLRequest: request }),
      },
      true,
    );
    expect(start.status, await start.clone().text()).toBe(303);
    const login = new URL(start.headers.get("location")!, base).href;
    const form = await (await http(login, {}, true)).text();
    expect(form).toContain(tenant === "biotech" ? "BIOTECH" : "INSURANCE");
    expect(form).not.toContain("AuthNAuthZ");
    const csrf = form.match(/name="csrf" value="([^"]+)"/)![1];
    const response = await http(
      login,
      {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          csrf,
          username: d.users[0].userName,
          password: "Test@User1",
        }),
      },
      true,
    );
    const xmlForm = await response.text();
    const samlResponse = xmlForm.match(
      /name="SAMLResponse" value="([^"]+)"/,
    )![1];
    const verified = await http(
      "/api/saml-test?tenant=" + tenant,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ SAMLResponse: samlResponse }),
      },
      true,
    );
    const body = await verified.text();
    expect(verified.status, body).toBe(200);
    expect(body).toContain("SAML SSO succeeded");
    expect(body).toContain(d.users[0].userName);
  });
}
for (const tenant of ["biotech", "insurance"]) {
  it(`brands WS-Fed login from ${tenant}'s domain and validates realm/reply routing`, async () => {
    const c = await (await admin("config?tenant=" + tenant)).json();
    c.accountDomains = {
      employee: "limekube.com",
      contractor: "partners.limekube.com",
    };
    c.wsfedApps = [
      {
        id: tenant + "-wsfed",
        name: "Test relying party",
        realm: base + "/" + tenant + "-rp",
        replyUrl: base + "/wsfed-callback",
        tokenType: "saml20",
      },
    ];
    const saved = await admin("config?tenant=" + tenant, "PUT", c);
    expect(saved.status, await saved.clone().text()).toBe(200);
    const response = await http(
      "/api/t/" +
        tenant +
        "/wsfed?" +
        new URLSearchParams({
          wa: "wsignin1.0",
          wtrealm: c.wsfedApps[0].realm,
          wfresh: "0",
        }),
      {},
      true,
    );
    expect(response.status).toBe(307);
    const login = new URL(response.headers.get("location")!, base).href;
    const page = await (await http(login, {}, true)).text();
    expect(page).toContain("LIMEKUBE");
    expect(page).not.toContain("AuthNAuthZ");
    const csrf = page.match(/name="csrf" value="([^"]+)"/)![1];
    const d = await (await admin("directory?tenant=" + tenant)).json();
    const signed = await http(
      login,
      {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          csrf,
          username: d.users[0].userName,
          password: "Test@User1",
        }),
      },
      true,
    );
    expect(signed.status).toBe(200);
    expect(signed.headers.get("content-type")).toContain("text/html");
    expect(await signed.text()).toContain('name="wresult"');
    const discovery = await (
      await http("/api/t/" + tenant + "/oidc/.well-known/openid-configuration")
    ).json();
    expect(discovery.issuer).toBe(base + "/api/t/" + tenant + "/oidc");
  });
}
