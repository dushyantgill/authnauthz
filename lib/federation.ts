import * as saml from "samlify";
import * as validator from "@authenio/samlify-node-xmllint";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { inflateRawSync } from "node:zlib";
import { randomUUID, randomBytes } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { origin, required, type TenantConfig } from "./config";
import { store, type Resource } from "./store";
import { memberships } from "./membership";
import { body } from "./http";
import {
  escape,
  currentSession,
  revokeSessions,
  csrf,
  verifyCsrf,
  passwordOK,
  setSession,
  clearSession,
  sameOrigin,
  loginLimit,
} from "./security";
saml.setSchemaValidator(validator);
const B = "urn:oasis:names:tc:SAML:2.0:bindings:";
const A = "urn:oasis:names:tc:SAML:2.0:assertion";
const P = "urn:oasis:names:tc:SAML:2.0:protocol";
const emailFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
const persistentFormat = "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent";
const transientFormat = "urn:oasis:names:tc:SAML:2.0:nameid-format:transient";
const SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
export function parseXml(xml: string) {
  if (Buffer.byteLength(xml) > 200000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Unsafe XML");
  let bad = false;
  const options = {
    locator: true,
    onError: () => {
      bad = true;
    },
  };
  const d = new DOMParser(options).parseFromString(xml, "text/xml");
  if (bad || !d.documentElement) throw Error("Malformed XML");
  const ids = new Set<string>();
  const els = d.getElementsByTagName("*");
  for (let i = 0; i < els.length; i++) {
    const e = els.item(i)!;
    for (const a of ["ID", "Id", "AssertionID"]) {
      const id = e.getAttribute(a);
      if (id) {
        if (ids.has(id)) throw Error("Duplicate XML ID");
        ids.add(id);
      }
    }
  }
  return d;
}
export function validateMetadata(xml: string) {
  const doc = parseXml(xml);
  if (
    doc.documentElement!.localName !== "EntityDescriptor" ||
    doc.documentElement!.namespaceURI !== "urn:oasis:names:tc:SAML:2.0:metadata"
  )
    throw Error("One EntityDescriptor is required");
  const sp = saml.ServiceProvider({
    metadata: xml,
    wantLogoutResponseSigned: true,
  });
  const acs = sp.entityMeta.getAssertionConsumerService("post");
  if (!acs) throw Error("HTTP-POST ACS required");
  const nodes = doc.getElementsByTagNameNS(
    "urn:oasis:names:tc:SAML:2.0:metadata",
    "AssertionConsumerService",
  );
  for (let i = 0; i < nodes.length; i++) {
    const u = new URL(nodes.item(i)!.getAttribute("Location")!);
    if (
      u.protocol !== "https:" &&
      !(!process.env.VERCEL && ["localhost", "127.0.0.1"].includes(u.hostname))
    )
      throw Error("ACS requires HTTPS");
  }
  return sp;
}
export function responseSP(
  app: TenantConfig["samlApps"][number],
  acs?: string,
) {
  const doc = parseXml(app.metadata);
  const ns = "urn:oasis:names:tc:SAML:2.0:metadata";
  const descriptor = doc.getElementsByTagNameNS(ns, "SPSSODescriptor").item(0);
  if (!descriptor) throw Error("SPSSODescriptor required");
  descriptor.setAttribute("WantAssertionsSigned", "true");
  const nodes = doc.getElementsByTagNameNS(ns, "AssertionConsumerService");
  const all = Array.from({ length: nodes.length }, (_, i) => nodes.item(i)!);
  const post = all.filter((n) => n.getAttribute("Binding") === B + "HTTP-POST");
  const selected = acs
    ? post.find((n) => n.getAttribute("Location") === acs)
    : post.find((n) => n.getAttribute("isDefault") === "true") ||
      post.sort(
        (a, b) =>
          Number(a.getAttribute("index")) - Number(b.getAttribute("index")),
      )[0];
  if (!selected) throw Error("No registered ACS");
  for (const n of post) if (n !== selected) n.parentNode!.removeChild(n);
  return saml.ServiceProvider({
    metadata: doc.toString(),
    wantMessageSigned: true,
    wantLogoutResponseSigned: true,
  });
}
export function samlError(
  t: string,
  app: TenantConfig["samlApps"][number],
  request: Resource,
  status: string,
  relay: string,
  res: NextApiResponse,
) {
  const dest = responseSP(
    app,
    request.acs,
  ).entityMeta.getAssertionConsumerService("post");
  const xml = `<samlp:Response xmlns:samlp="${P}" xmlns:saml="${A}" ID="_${randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${escape(dest)}" InResponseTo="${escape(request.id)}"><saml:Issuer>${escape(`${origin()}/api/t/${t}/saml`)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:${escape(status)}"/></samlp:StatusCode></samlp:Status></samlp:Response>`;
  const signed = signedXml(xml, "/*[local-name()='Response']");
  return postForm(res, String(dest), {
    SAMLResponse: Buffer.from(signed).toString("base64"),
    RelayState: relay,
  });
}
export function idp(t: string, app?: TenantConfig["samlApps"][number]) {
  const base = `${origin()}/api/t/${t}/saml`;
  return saml.IdentityProvider({
    entityID: base,
    privateKey: required("SAML_PRIVATE_KEY"),
    signingCert: required("SAML_CERTIFICATE"),
    generateID: () => `_${randomUUID()}`,
    requestSignatureAlgorithm: SHA256,
    nameIDFormat: [persistentFormat, emailFormat, transientFormat],
    wantAuthnRequestsSigned: app?.requireSignedRequests ?? true,
    wantLogoutRequestSigned: true,
    isAssertionEncrypted: app?.encryptAssertions ?? false,
    ...{
      dataEncryptionAlgorithm: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
    },
    singleSignOnService: [
      { Binding: B + "HTTP-Redirect", Location: base + "/sso" },
      { Binding: B + "HTTP-POST", Location: base + "/sso" },
    ],
    singleLogoutService: [
      { Binding: B + "HTTP-Redirect", Location: base + "/slo" },
      { Binding: B + "HTTP-POST", Location: base + "/slo" },
    ],
  });
}
export function signedXml(xml: string, reference: string) {
  const sig = new SignedXml({
    privateKey: required("SAML_PRIVATE_KEY"),
    publicCert: required("SAML_CERTIFICATE"),
    signatureAlgorithm: SHA256,
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: reference,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
  });
  const doc = parseXml(xml);
  const hasIssuer =
    doc.documentElement!.namespaceURI === A ||
    doc.documentElement!.namespaceURI === P;
  sig.computeSignature(xml, {
    location: hasIssuer
      ? { reference: reference + "/*[local-name()='Issuer']", action: "after" }
      : { reference, action: "prepend" },
  });
  return sig.getSignedXml();
}
export function samlTemplate(
  t: string,
  app: TenantConfig["samlApps"][number],
  request: Resource,
  user: Resource,
  format: string,
  authTime: number,
  groups: string[],
  sessionIndex = "_" + randomUUID(),
  selectedName?: string,
) {
  const sp = responseSP(app, request.acs),
    dest = sp.entityMeta.getAssertionConsumerService("post"),
    now = new Date(),
    expiry = new Date(now.getTime() + 300000).toISOString(),
    id = "_" + randomUUID(),
    assertion = "_" + randomUUID();
  const name =
    selectedName ||
    (format === emailFormat
      ? user.userName
      : format === transientFormat
        ? "_" + randomUUID()
        : user.id);
  const attributes: { name: string; values: string[] }[] = [
    { name: "email", values: [user.userName] },
    { name: "displayName", values: [user.displayName] },
    { name: "givenName", values: [user.name?.givenName || ""] },
    { name: "surname", values: [user.name?.familyName || ""] },
    { name: "groups", values: groups },
  ];
  const xml = `<samlp:Response xmlns:samlp="${P}" xmlns:saml="${A}" ID="${id}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${escape(dest)}" InResponseTo="${escape(request.id)}"><saml:Issuer>${escape(`${origin()}/api/t/${t}/saml`)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion xmlns:saml="${A}" ID="${assertion}" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${escape(`${origin()}/api/t/${t}/saml`)}</saml:Issuer><saml:Subject><saml:NameID Format="${format}">${escape(name)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${expiry}" Recipient="${escape(dest)}" InResponseTo="${escape(request.id)}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(now.getTime() - 60000).toISOString()}" NotOnOrAfter="${expiry}"><saml:AudienceRestriction><saml:Audience>${escape(sp.entityMeta.getEntityID())}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${new Date(authTime * 1000).toISOString()}" SessionIndex="${escape(sessionIndex)}" SessionNotOnOrAfter="${new Date(now.getTime() + 3600000).toISOString()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement>${attributes.map((a) => `<saml:Attribute Name="${a.name}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">${a.values.map((v) => `<saml:AttributeValue>${escape(v)}</saml:AttributeValue>`).join("")}</saml:Attribute>`).join("")}</saml:AttributeStatement></saml:Assertion></samlp:Response>`;
  return { id, context: xml, name, sessionIndex };
}
export function postForm(
  res: NextApiResponse,
  url: string,
  fields: Record<string, string>,
) {
  const nonce = randomBytes(18).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${new URL(url).origin}; frame-ancestors 'none'`,
  );
  return res.status(200).send(
    `<!doctype html><html><head><title>Continue sign-in</title></head><body><form method="post" action="${escape(url)}">${Object.entries(
      fields,
    )
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`,
      )
      .join(
        "",
      )}<button>Continue</button></form><script nonce="${nonce}">document.forms[0].submit()</script></body></html>`,
  );
}
function requestEnvelope(req: NextApiRequest, b: Resource) {
  const query = new URL(req.url!, origin()).searchParams;
  const allowed = ["SAMLRequest", "RelayState", "SigAlg", "Signature"];
  for (const k of allowed)
    if (query.getAll(k).length > 1) throw Error("Duplicate SAML parameter");
  const octetString = [
    "SAMLRequest",
    ...(query.has("RelayState") ? ["RelayState"] : []),
    "SigAlg",
  ]
    .map((k) => {
      const raw = (req.url!.split("?")[1] || "")
        .split("&")
        .find((v) => v.split("=")[0] === k);
      return raw || "";
    })
    .join("&");
  return { query: Object.fromEntries(query), body: b, octetString };
}
export async function validateRequest(
  t: string,
  req: NextApiRequest,
  b: Resource,
  slo = false,
) {
  const envelope = requestEnvelope(req, b),
    binding = req.method === "GET" ? "redirect" : "post",
    encoded = String(
      binding === "redirect"
        ? envelope.query.SAMLRequest
        : envelope.body.SAMLRequest || "",
    );
  if (!encoded || encoded.length > 100000) throw Error("Invalid SAMLRequest");
  const xml = (
    binding === "redirect"
      ? inflateRawSync(Buffer.from(encoded, "base64"), {
          maxOutputLength: 200000,
        })
      : Buffer.from(encoded, "base64")
  ).toString();
  const doc = parseXml(xml),
    root = doc.documentElement!;
  const expected = slo ? "LogoutRequest" : "AuthnRequest";
  if (
    root.localName !== expected ||
    root.namespaceURI !== P ||
    root.getAttribute("Version") !== "2.0"
  )
    throw Error("Unsupported SAML request");
  if (doc.getElementsByTagNameNS(P, expected).length !== 1)
    throw Error("Ambiguous SAML request");
  const issuers = doc.getElementsByTagNameNS(A, "Issuer");
  if (issuers.length !== 1 || issuers.item(0)!.parentNode !== root)
    throw Error("Invalid issuer");
  const state = await store().read(t),
    app = state.config.samlApps.find(
      (a) =>
        validateMetadata(a.metadata).entityMeta.getEntityID() ===
        issuers.item(0)!.textContent,
    );
  if (!app) throw Error("Unregistered service provider");
  const sp = validateMetadata(app.metadata),
    entity = idp(t, {
      ...app,
      requireSignedRequests:
        app.requireSignedRequests ||
        !!envelope.query.Signature ||
        doc.getElementsByTagNameNS(
          "http://www.w3.org/2000/09/xmldsig#",
          "Signature",
        ).length > 0,
    });
  const destination = `${origin()}/api/t/${t}/saml/${slo ? "slo" : "sso"}`;
  if (root.getAttribute("Destination") !== destination)
    throw Error("Destination mismatch");
  const instant = Date.parse(root.getAttribute("IssueInstant") || "");
  if (!Number.isFinite(instant) || Math.abs(Date.now() - instant) > 300000)
    throw Error("Stale request");
  const requestId = root.getAttribute("ID");
  if (!requestId || !/^[_a-zA-Z][\w.-]{0,200}$/.test(requestId))
    throw Error("Invalid request ID");
  const relay = String(
    binding === "redirect"
      ? envelope.query.RelayState || ""
      : b.RelayState || "",
  );
  if (Buffer.byteLength(relay) > 80) throw Error("RelayState exceeds 80 bytes");
  if (
    xml.includes("http://www.w3.org/2000/09/xmldsig#sha1") ||
    xml.includes("rsa-sha1") ||
    (envelope.query.SigAlg && envelope.query.SigAlg !== SHA256)
  )
    throw Error("Weak signature algorithm");
  const signatures = doc.getElementsByTagNameNS(
    "http://www.w3.org/2000/09/xmldsig#",
    "Signature",
  );
  if (binding === "post" && signatures.length) {
    if (signatures.length !== 1 || signatures.item(0)!.parentNode !== root)
      throw Error("Ambiguous request signature");
    const references = doc.getElementsByTagNameNS(
      "http://www.w3.org/2000/09/xmldsig#",
      "Reference",
    );
    if (
      references.length !== 1 ||
      references.item(0)!.getAttribute("URI") !== "#" + requestId
    )
      throw Error("Invalid signature reference");
    const method = doc
      .getElementsByTagNameNS(
        "http://www.w3.org/2000/09/xmldsig#",
        "SignatureMethod",
      )
      .item(0);
    if (method?.getAttribute("Algorithm") !== SHA256)
      throw Error("Unsupported signature algorithm");
    const transforms = doc.getElementsByTagNameNS(
      "http://www.w3.org/2000/09/xmldsig#",
      "Transform",
    );
    for (let i = 0; i < transforms.length; i++)
      if (
        ![
          "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
          "http://www.w3.org/2001/10/xml-exc-c14n#",
        ].includes(transforms.item(i)!.getAttribute("Algorithm") || "")
      )
        throw Error("Unsupported signature transform");
  }
  const parsed = slo
    ? await entity.parseLogoutRequest(sp, binding, envelope)
    : await entity.parseLoginRequest(sp, binding, envelope);
  if (slo) {
    await store().once(t, requestId, 600);
    return { app, sp, entity, parsed, relay, binding, root };
  }
  const acs = root.getAttribute("AssertionConsumerServiceURL"),
    index = root.getAttribute("AssertionConsumerServiceIndex");
  if (index && (acs || root.getAttribute("ProtocolBinding")))
    throw Error("Conflicting ACS selectors");
  const acsNodes = parseXml(app.metadata).getElementsByTagNameNS(
    "urn:oasis:names:tc:SAML:2.0:metadata",
    "AssertionConsumerService",
  );
  const postNodes = Array.from({ length: acsNodes.length }, (_, i) =>
    acsNodes.item(i)!,
  ).filter((n) => n.getAttribute("Binding") === B + "HTTP-POST");
  const selected = index
    ? postNodes.find((n) => n.getAttribute("index") === index)
    : acs
      ? postNodes.find((n) => n.getAttribute("Location") === acs)
      : postNodes.find((n) => n.getAttribute("isDefault") === "true") ||
        postNodes.sort(
          (a, b) =>
            Number(a.getAttribute("index")) - Number(b.getAttribute("index")),
        )[0];
  if (
    !selected ||
    (root.getAttribute("ProtocolBinding") &&
      root.getAttribute("ProtocolBinding") !== B + "HTTP-POST")
  )
    throw Error("Unregistered ACS or unsupported response binding");
  const acsUrl = selected.getAttribute("Location")!;
  let status: string | undefined;
  const policy = doc.getElementsByTagNameNS(P, "NameIDPolicy").item(0),
    format = policy?.getAttribute("Format") || persistentFormat;
  if (![persistentFormat, emailFormat, transientFormat].includes(format))
    status = "InvalidNameIDPolicy";
  if (
    policy?.getAttribute("SPNameQualifier") &&
    policy.getAttribute("SPNameQualifier") !== sp.entityMeta.getEntityID()
  )
    status = "InvalidNameIDPolicy";
  const contexts = doc.getElementsByTagNameNS(A, "AuthnContextClassRef");
  if (
    contexts.length &&
    Array.from(
      { length: contexts.length },
      (_, i) => contexts.item(i)!.textContent,
    ).every(
      (x) =>
        x !==
        "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    )
  )
    status = "NoAuthnContext";
  const requestedContext = doc
    .getElementsByTagNameNS(P, "RequestedAuthnContext")
    .item(0);
  if (
    requestedContext?.getAttribute("Comparison") &&
    !["exact", "minimum", "maximum"].includes(
      requestedContext.getAttribute("Comparison")!,
    )
  )
    status = "NoAuthnContext";
  if (
    root.getAttribute("IsPassive") === "true" &&
    (root.getAttribute("ForceAuthn") === "true" || !(await currentSession(req)))
  )
    status = "NoPassive";
  await store().once(t, requestId, 600);
  return {
    app,
    sp,
    entity,
    parsed,
    relay,
    binding,
    root,
    format,
    acsUrl,
    status,
  };
}
export function wsToken(
  t: string,
  app: TenantConfig["wsfedApps"][number],
  u: Resource,
  groups: string[],
  authTime: number,
) {
  const now = new Date(),
    end = new Date(now.getTime() + 300000).toISOString(),
    id = "_" + randomUUID(),
    iss = `${origin()}/api/t/${t}/wsfed`,
    attrs = [
      [
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
        [u.id],
      ],
      [
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
        [u.displayName],
      ],
      [
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        [u.userName],
      ],
      [
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
        groups,
      ],
    ] as [string, string[]][];
  let xml: string;
  if (app.tokenType === "saml11") {
    const subject = `<saml:Subject><saml:NameIdentifier Format="${emailFormat}">${escape(u.userName)}</saml:NameIdentifier><saml:SubjectConfirmation><saml:ConfirmationMethod>urn:oasis:names:tc:SAML:1.0:cm:bearer</saml:ConfirmationMethod></saml:SubjectConfirmation></saml:Subject>`;
    xml = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:1.0:assertion" MajorVersion="1" MinorVersion="1" AssertionID="${id}" Issuer="${escape(iss)}" IssueInstant="${now.toISOString()}"><saml:Conditions NotBefore="${new Date(now.getTime() - 60000).toISOString()}" NotOnOrAfter="${end}"><saml:AudienceRestrictionCondition><saml:Audience>${escape(app.realm)}</saml:Audience></saml:AudienceRestrictionCondition></saml:Conditions><saml:AuthenticationStatement AuthenticationMethod="urn:oasis:names:tc:SAML:1.0:am:password" AuthenticationInstant="${new Date(authTime * 1000).toISOString()}">${subject}</saml:AuthenticationStatement><saml:AttributeStatement>${subject}${attrs
      .map(([n, vs]) => {
        const j = n.lastIndexOf("/");
        return `<saml:Attribute AttributeName="${escape(n.slice(j + 1))}" AttributeNamespace="${escape(n.slice(0, j))}">${vs.map((v) => `<saml:AttributeValue>${escape(v)}</saml:AttributeValue>`).join("")}</saml:Attribute>`;
      })
      .join("")}</saml:AttributeStatement></saml:Assertion>`;
  } else
    xml = `<saml:Assertion xmlns:saml="${A}" ID="${id}" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${escape(iss)}</saml:Issuer><saml:Subject><saml:NameID>${escape(u.id)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData Recipient="${escape(app.replyUrl)}" NotOnOrAfter="${end}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(now.getTime() - 60000).toISOString()}" NotOnOrAfter="${end}"><saml:AudienceRestriction><saml:Audience>${escape(app.realm)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${new Date(authTime * 1000).toISOString()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement>${attrs.map(([n, vs]) => `<saml:Attribute Name="${escape(n)}">${vs.map((v) => `<saml:AttributeValue>${escape(v)}</saml:AttributeValue>`).join("")}</saml:Attribute>`).join("")}</saml:AttributeStatement></saml:Assertion>`;
  const assertion = signedXml(xml, "/*[local-name()='Assertion']"),
    tokenType =
      app.tokenType === "saml11" ? "urn:oasis:names:tc:SAML:1.0:assertion" : A;
  return `<t:RequestSecurityTokenResponse xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust" xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><t:Lifetime><wsu:Created>${now.toISOString()}</wsu:Created><wsu:Expires>${end}</wsu:Expires></t:Lifetime><wsp:AppliesTo><wsa:EndpointReference><wsa:Address>${escape(app.realm)}</wsa:Address></wsa:EndpointReference></wsp:AppliesTo><t:TokenType>${tokenType}</t:TokenType><t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType><t:RequestedSecurityToken>${assertion}</t:RequestedSecurityToken><t:RequestedAttachedReference><o:SecurityTokenReference xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><o:KeyIdentifier ValueType="http://docs.oasis-open.org/wss/oasis-wss-saml-token-profile-1.1#SAMLAssertionID">${id}</o:KeyIdentifier></o:SecurityTokenReference></t:RequestedAttachedReference></t:RequestSecurityTokenResponse>`;
}
function wsMetadata(t: string) {
  const base = `${origin()}/api/t/${t}/wsfed`,
    cert = required("SAML_CERTIFICATE").replace(/-----[^-]+-----|\s/g, "");
  return signedXml(
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:fed="http://docs.oasis-open.org/wsfed/federation/200706" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ID="_${randomUUID()}" entityID="${escape(base)}"><md:RoleDescriptor xsi:type="fed:SecurityTokenServiceType" protocolSupportEnumeration="http://docs.oasis-open.org/wsfed/federation/200706"><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><fed:TokenTypesOffered><fed:TokenType Uri="urn:oasis:names:tc:SAML:1.0:assertion"/><fed:TokenType Uri="${A}"/></fed:TokenTypesOffered><fed:PassiveRequestorEndpoint><wsa:EndpointReference><wsa:Address>${escape(base)}</wsa:Address></wsa:EndpointReference></fed:PassiveRequestorEndpoint></md:RoleDescriptor></md:EntityDescriptor>`,
    "/*[local-name()='EntityDescriptor']",
  );
}
async function pending(t: string, payload: Resource) {
  const id = randomBytes(24).toString("hex");
  await store().mutate(t, (s) => {
    s.models["Federation:" + id] = { payload, expires: Date.now() + 300000 };
  });
  return id;
}
export async function federation(
  t: string,
  path: string[],
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const [protocol, action] = path;
    if (action === "metadata" && req.method === "GET") {
      res.setHeader("Content-Type", "application/xml");
      const xml =
        protocol === "saml"
          ? signedXml(
              idp(t).getMetadata(),
              "/*[local-name()='EntityDescriptor']",
            )
          : wsMetadata(t);
      return res.send(xml);
    }
    if (action === "login") {
      const uid = String(req.query.uid || "");
      const state = await store().read(t),
        entry = state.models["Federation:" + uid];
      if (!entry || entry.expires < Date.now())
        return res.status(400).send("Expired sign-in request");
      if (req.method === "GET") {
        const token = await csrf(t, uid);
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        );
        return res.send(
          `<!doctype html><html><head><title>Summit Ridge sign in</title><style>body{font:16px system-ui;max-width:520px;margin:6% auto}input,select,button{display:block;width:100%;padding:12px;box-sizing:border-box;margin:18px 0}</style></head><body><h1>Summit Ridge Properties</h1><p>Sign in to ${escape(entry.payload.appName)} using a simulation identity.</p><form method="post"><input type="hidden" name="csrf" value="${token}"><label>Identity<select name="accountId">${state.resources.Users.filter(
            (u) => u.active,
          )
            .map(
              (u) =>
                `<option value="${u.id}">${escape(u.displayName)} — ${escape(u.title)}</option>`,
            )
            .join(
              "",
            )}</select></label><label>Simulation password<input type="password" name="password" required></label><button>Sign in</button></form></body></html>`,
        );
      }
      if (req.method !== "POST") return res.status(405).end();
      if (!sameOrigin(req)) return res.status(403).end();
      const b = await body(req);
      await verifyCsrf(t, b.csrf, uid);
      await loginLimit(
        t,
        String(req.headers["x-forwarded-for"] || req.socket.remoteAddress),
      );
      if (!(await passwordOK(t, b.accountId, b.password)))
        return res.status(401).send("Invalid credentials");
      await setSession(res, b.accountId);
      const payload = await store().mutate(t, (s) => {
        const e = s.models["Federation:" + uid];
        if (!e) throw Error("Sign-in already completed");
        delete s.models["Federation:" + uid];
        return e.payload;
      });
      return await finish(
        t,
        payload,
        b.accountId,
        Math.floor(Date.now() / 1000),
        res,
      );
    }
    if (protocol === "saml" && (action === "sso" || action === "slo")) {
      if (!["GET", "POST"].includes(req.method || ""))
        return res.status(405).end();
      const b = req.method === "POST" ? await body(req) : {};
      const v = await validateRequest(t, req, b, action === "slo");
      if (action === "slo") {
        const name = String(v.parsed.extract.nameID);
        const indexes = v.root.getElementsByTagNameNS(P, "SessionIndex");
        const requested = Array.from(
          { length: indexes.length },
          (_, i) => indexes.item(i)!.textContent,
        );
        const state = await store().read(t);
        const sessions = Object.entries(state.models).filter(
          ([k, e]) =>
            k.startsWith("SamlSession:") &&
            e.payload.appId === v.app.id &&
            e.payload.name === name &&
            (!requested.length || requested.includes(e.payload.sessionIndex)),
        );
        if (!sessions.length) throw Error("Unknown SAML session");
        for (const [, e] of sessions)
          await revokeSessions(t, e.payload.accountId);
        clearSession(res);
        const out = v.entity.createLogoutResponse(
          v.sp,
          { extract: v.parsed.extract },
          v.binding,
          { relayState: v.relay },
        );
        if (v.binding === "redirect") return res.redirect(String(out.context));
        return postForm(
          res,
          String(v.sp.entityMeta.getSingleLogoutService("post")),
          { SAMLResponse: String(out.context), RelayState: v.relay },
        );
      }
      const subject = v.root
        .getElementsByTagNameNS(A, "Subject")
        .item(0)
        ?.getElementsByTagNameNS(A, "NameID")
        .item(0)?.textContent;
      const request = { id: v.root.getAttribute("ID"), acs: v.acsUrl, subject };
      if (v.status) return samlError(t, v.app, request, v.status, v.relay, res);
      const payload = {
        protocol: "saml",
        appId: v.app.id,
        appName: v.app.name,
        request,
        format: v.format,
        relay: v.relay,
      };
      const session = await currentSession(req);
      if (session && v.root.getAttribute("ForceAuthn") !== "true")
        return await finish(t, payload, session.id, session.authTime, res);
      const uid = await pending(t, payload);
      return res.redirect(`/api/t/${t}/saml/login?uid=${uid}`);
    }
    if (protocol === "wsfed" && !action) {
      if (req.method !== "GET") return res.status(405).end();
      const q = new URL(req.url!, origin()).searchParams;
      for (const k of ["wa", "wtrealm", "wreply", "wctx", "wfresh"])
        if (q.getAll(k).length > 1) throw Error("Duplicate WS-Fed parameter");
      const state = await store().read(t),
        app = state.config.wsfedApps.find((a) => a.realm === q.get("wtrealm"));
      if (
        q.get("wa") === "wsignout1.0" ||
        q.get("wa") === "wsignoutcleanup1.0"
      ) {
        if (q.get("wreply") && (!app || q.get("wreply") !== app.replyUrl))
          throw Error("Unregistered logout reply");
        const session = await currentSession(req);
        if (session) await revokeSessions(t, session.id);
        clearSession(res);
        return app && q.get("wreply")
          ? res.redirect(app.replyUrl)
          : res.send("Signed out");
      }
      if (q.get("wa") !== "wsignin1.0" || !app)
        throw Error("Unregistered realm or operation");
      if (q.get("wreply") && q.get("wreply") !== app.replyUrl)
        throw Error("Unregistered reply URL");
      if (q.has("wreq") || q.has("whr") || q.has("wauth"))
        throw Error("Unsupported WS-Fed extension");
      const context = q.get("wctx") || "";
      if (context.length > 4096) throw Error("Context too long");
      const payload = {
        protocol: "wsfed",
        appId: app.id,
        appName: app.name,
        context,
      };
      const session = await currentSession(req),
        fresh = q.get("wfresh");
      if (fresh !== null && !/^\d+$/.test(fresh))
        throw Error("Invalid freshness");
      if (
        session &&
        (fresh === null ||
          (Number(fresh) > 0 &&
            Date.now() / 1000 - session.authTime < Number(fresh) * 60))
      )
        return finish(t, payload, session.id, session.authTime, res);
      const uid = await pending(t, payload);
      return res.redirect(`/api/t/${t}/wsfed/login?uid=${uid}`);
    }
    return res.status(404).end();
  } catch (e) {
    console.error(
      "Federation rejected",
      e instanceof Error ? e.message : "invalid",
    );
    return res.status(400).json({
      error: "invalid_request",
      detail: e instanceof Error ? e.message : "Invalid federation request",
    });
  }
}
async function finish(
  t: string,
  payload: Resource,
  id: string,
  authTime: number,
  res: NextApiResponse,
) {
  const state = await store().read(t),
    user = state.resources.Users.find((u) => u.id === id && u.active);
  if (!user) throw Error("Inactive identity");
  const groups = memberships(state.resources.Groups, id).map((g) =>
    state.config.persona === "entra" ? g.id : g.displayName,
  );
  await store().audit(t, payload.protocol + ".sign_in", id);
  if (payload.protocol === "saml") {
    const app = state.config.samlApps.find((a) => a.id === payload.appId);
    if (!app) throw Error("Application removed");
    if (
      payload.request.subject &&
      ![user.id, user.userName].includes(payload.request.subject)
    )
      return samlError(
        t,
        app,
        payload.request,
        "AuthnFailed",
        payload.relay,
        res,
      );
    const sp = responseSP(app, payload.request.acs);
    const sessionIndex = "_" + randomUUID();
    const name =
      payload.format === emailFormat
        ? user.userName
        : payload.format === transientFormat
          ? "_" + randomUUID()
          : user.id;
    await store().mutate(t, (s) => {
      s.models["SamlSession:" + sessionIndex] = {
        payload: { accountId: id, appId: app.id, name, sessionIndex },
        expires: Date.now() + 3600000,
      };
    });
    const entity = idp(t, app);
    const result = await entity.createLoginResponse(
      sp,
      { extract: { request: payload.request } },
      "post",
      { email: user.userName },
      {
        relayState: payload.relay,
        encryptThenSign: app.encryptAssertions,
        customTagReplacement: () =>
          samlTemplate(
            t,
            app,
            payload.request,
            user,
            payload.format,
            authTime,
            groups,
            sessionIndex,
            name,
          ),
      },
    );
    return postForm(
      res,
      String(sp.entityMeta.getAssertionConsumerService("post")),
      { SAMLResponse: String(result.context), RelayState: payload.relay },
    );
  }
  const app = state.config.wsfedApps.find((a) => a.id === payload.appId);
  if (!app) throw Error("Application removed");
  return postForm(res, app.replyUrl, {
    wa: "wsignin1.0",
    wresult: wsToken(t, app, user, groups, authTime),
    wctx: payload.context,
  });
}
