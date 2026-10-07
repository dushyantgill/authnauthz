import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, randomUUID } from "node:crypto";
import * as saml from "samlify";
import { origin, required } from "../../lib/config";
import { headers, equal, escape } from "../../lib/security";
import { store } from "../../lib/store";
import { body } from "../../lib/http";
import { idp, parseXml } from "../../lib/federation";
import {
  testAppId,
  testRequest,
  testSp,
  testAcs,
  testEntity,
} from "../../lib/saml-test";
export const config = { api: { bodyParser: false } };
const cookie = "authnauthz_saml_test";
function sign(value: string) {
  return createHmac("sha256", required("COOKIE_SECRET"))
    .update(value)
    .digest("base64url");
}
function page(title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · AuthNAuthZ</title><style>@font-face{font-family:Plex;src:url(/fonts/ibm-plex-sans-regular.woff2)}body{font:16px/1.6 Plex,system-ui;background:#f1f7eb;color:#19231e;max-width:900px;margin:40px auto;padding:24px}main{background:white;padding:28px;border-radius:16px}button,a.button{background:#a3e635;color:#19231e;border:0;border-radius:8px;padding:12px 20px;font:inherit;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8f4;padding:16px;font-size:12px}a{color:inherit}</style></head><body><main><h1>${escape(title)}</h1>${content}</main></body></html>`;
}
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  try {
    const state = await store().read("realestate");
    const app = state.config.samlApps.find((a) => a.id === testAppId);
    if (!app)
      return res
        .status(409)
        .send(
          page(
            "Test application not registered",
            "<p>Register the Real Estate SAML Test service provider before starting.</p>",
          ),
        );
    if (req.method === "GET") {
      const id = "_" + randomUUID(),
        payload = Buffer.from(
          JSON.stringify({ id, exp: Date.now() + 600000 }),
        ).toString("base64url");
      res.setHeader(
        "Set-Cookie",
        `${cookie}=${payload}.${sign(payload)}; Path=/api/saml-test; HttpOnly; SameSite=Lax; Max-Age=600${origin().startsWith("https:") ? "; Secure" : ""}`,
      );
      const xml = testRequest(id);
      return res.send(
        page(
          "Real Estate SAML SSO test",
          `<p>This starts a fresh sign-in to the Real Estate IdP and validates its signed SAML response. Use an active directory username and your shared simulator password.</p><form method="post" action="${escape(origin())}/api/t/realestate/saml/sso"><input type="hidden" name="SAMLRequest" value="${Buffer.from(xml).toString("base64")}"><input type="hidden" name="RelayState" value="realestate-saml-test"><button>Start SAML SSO →</button></form><details><summary>View the AuthnRequest XML</summary><pre>${escape(xml)}</pre></details><p>Each request expires after five minutes. Reload this page to start again. This dedicated test SP accepts unsigned authentication requests; returned assertions and responses must be signed.</p>`,
        ),
      );
    }
    if (req.method !== "POST") return res.status(405).end();
    const raw = req.cookies[cookie] || "",
      separator = raw.lastIndexOf("."),
      payload = raw.slice(0, separator),
      signature = raw.slice(separator + 1);
    if (separator < 0 || !equal(sign(payload), signature))
      throw Error("No matching test request. Start a fresh test.");
    const pending = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (pending.exp < Date.now())
      throw Error("Test request expired. Start a fresh test.");
    const b = await body(req);
    if (typeof b.SAMLResponse !== "string") throw Error("Missing SAMLResponse");
    const xml = Buffer.from(b.SAMLResponse, "base64").toString(),
      doc = parseXml(xml),
      root = doc.documentElement!;
    if (
      root.localName !== "Response" ||
      root.getAttribute("Destination") !== testAcs() ||
      root.getAttribute("InResponseTo") !== pending.id
    )
      throw Error("SAML response does not match this test request");
    const assertions = doc.getElementsByTagNameNS(
      "urn:oasis:names:tc:SAML:2.0:assertion",
      "Assertion",
    );
    if (assertions.length !== 1) throw Error("Expected one signed assertion");
    const assertion = assertions.item(0)!;
    const confirmation = assertion
      .getElementsByTagNameNS(
        "urn:oasis:names:tc:SAML:2.0:assertion",
        "SubjectConfirmationData",
      )
      .item(0);
    if (
      !confirmation ||
      confirmation.getAttribute("InResponseTo") !== pending.id ||
      confirmation.getAttribute("Recipient") !== testAcs() ||
      !Number.isFinite(
        Date.parse(confirmation.getAttribute("NotOnOrAfter") || ""),
      ) ||
      Date.parse(confirmation.getAttribute("NotOnOrAfter") || "") <= Date.now()
    )
      throw Error("Invalid subject confirmation");
    const audience = assertion
      .getElementsByTagNameNS(
        "urn:oasis:names:tc:SAML:2.0:assertion",
        "Audience",
      )
      .item(0)?.textContent;
    if (audience !== testEntity()) throw Error("Unexpected audience");
    const parsed = await testSp().parseLoginResponse(
      saml.IdentityProvider({ metadata: idp("realestate").getMetadata() }),
      "post",
      { body: { SAMLResponse: b.SAMLResponse } },
    );
    await store().once("realestate", "saml-test:" + pending.id, 600);
    res.setHeader(
      "Set-Cookie",
      `${cookie}=; Path=/api/saml-test; HttpOnly; SameSite=Lax; Max-Age=0${origin().startsWith("https:") ? "; Secure" : ""}`,
    );
    return res.send(
      page(
        "SAML SSO succeeded",
        `<p>The response and assertion signatures, request correlation, recipient, and audience passed validation.</p><h2>Signed identity and attributes</h2><pre>${escape(JSON.stringify(parsed.extract, null, 2))}</pre><details><summary>View the SAML response XML</summary><pre>${escape(xml)}</pre></details><a class="button" href="/api/saml-test">Run another test</a>`,
      ),
    );
  } catch (e) {
    return res
      .status(400)
      .send(
        page(
          "SAML test could not complete",
          `<p>${escape(e instanceof Error ? e.message : "Invalid SAML response")}</p><a href="/api/saml-test">Start a fresh test</a>`,
        ),
      );
  }
}
