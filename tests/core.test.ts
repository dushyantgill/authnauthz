import { describe, it, expect } from "vitest";
import { Store, MemoryBackend, initial } from "../lib/store";
import { ConfigSchema } from "../lib/config";
import { matches, patch, validate, ScimError } from "../lib/scim";
import { parse } from "scim2-parse-filter";
import {
  parseXml,
  signedXml,
  wsToken,
  idp,
  samlTemplate,
} from "../lib/federation";
import { SignedXml } from "xml-crypto";
import { required } from "../lib/config";
import seed from "../data/summit-ridge.json";
import * as saml from "samlify";
import { adapter } from "../lib/oidc";
describe("Locked Summit Ridge archetype", () => {
  it("preserves all identities, totals, organizations and one acyclic CEO root", () => {
    expect(seed.users).toHaveLength(267);
    expect(seed.users.filter((u) => u.userType === "Employee")).toHaveLength(
      238,
    );
    expect(seed.users.filter((u) => u.userType === "Contractor")).toHaveLength(
      29,
    );
    expect(seed.organizations).toHaveLength(9);
    expect(seed.groups).toHaveLength(185);
    expect(new Set(seed.users.map((u) => u.id)).size).toBe(267);
    const roots = seed.users.filter((u) => !u.manager);
    expect(roots).toHaveLength(1);
    expect(roots[0].userName).toBe("danj@summitridge.example");
    for (const u of seed.users) {
      const seen = new Set();
      let current: typeof u | undefined = u;
      while (current) {
        expect(seen.has(current.id)).toBe(false);
        seen.add(current.id);
        current = seed.users.find((x) => x.id === current!.manager);
      }
    }
    for (const o of seed.organizations) {
      expect(
        seed.users.filter(
          (u) => u.organization === o.name && u.userType === "Employee",
        ),
      ).toHaveLength(o.employees);
      expect(
        seed.users.filter(
          (u) => u.organization === o.name && u.userType === "Contractor",
        ),
      ).toHaveLength(o.vendors);
    }
    expect(
      seed.users.some(
        (u) => u.title === "Senior Counsel, Employment & Immigration",
      ),
    ).toBe(true);
  });
  it("has no secrets, sensitive case statuses, orphan memberships, or frontline roles", () => {
    const text = JSON.stringify(seed).toLowerCase();
    for (const p of [
      "password",
      "thumbnailphoto",
      "traffick",
      "t-visa",
      "survivor",
      "janitor",
      "laborer",
    ])
      expect(text).not.toContain(p);
    for (const g of seed.groups)
      for (const m of g.members)
        expect(seed.users.some((u) => u.id === m.value)).toBe(true);
  });
});
describe("Atomic state", () => {
  it("retains concurrent mutations without lost updates", async () => {
    const s = new Store(new MemoryBackend());
    await s.mutate("realestate", (v) => {
      v.version = 1;
    });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        s.mutate("realestate", (v) => {
          v.events.push({ at: "now", type: "update" });
        }),
      ),
    );
    expect((await s.read("realestate")).events).toHaveLength(4);
  });
  it("admits only one consumer of a replay identifier", async () => {
    const s = new Store(new MemoryBackend());
    const r = await Promise.allSettled([
      s.once("realestate", "request-1", 30),
      s.once("realestate", "request-1", 30),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("atomically consumes authorization credentials", async () => {
    const A = adapter("realestate");
    const a = new A("AuthorizationCode");
    await a.upsert("test-race", { accountId: "123" }, 60);
    const r = await Promise.allSettled([
      a.consume("test-race"),
      a.consume("test-race"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await a.find("test-race"))?.consumed).toBeTruthy();
  });
});
describe("SCIM semantics", () => {
  it("evaluates complex value filters, case insensitive attributes and logical expressions", () => {
    const r = {
      userName: "Alice@example.com",
      active: true,
      emails: [{ type: "work", value: "Alice@example.com" }],
    };
    expect(
      matches(
        r,
        parse(
          'USERNAME eq "alice@example.com" and emails[type eq "work" and value co "@example.com"]',
        ),
      ),
    ).toBe(true);
    expect(matches(r, parse("not (active eq false)"))).toBe(true);
    expect(matches(r, parse('emails.value ew ".com"'))).toBe(true);
  });
  it("supports filtered patch, removal and subattribute replacement", () => {
    const r = {
      emails: [
        { value: "old@example.com", type: "work" },
        { value: "personal@example.com", type: "home" },
      ],
    };
    const out = patch(r, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [
        {
          op: "Replace",
          path: 'emails[type eq "work"].value',
          value: "new@example.com",
        },
        { op: "remove", path: 'emails[type eq "home"]' },
      ],
    });
    expect(out.emails).toEqual([{ type: "work", value: "new@example.com" }]);
    expect(r.emails).toHaveLength(2);
  });
  it("rejects duplicate usernames, sensitive attributes and prototype paths", () => {
    const s = initial();
    expect(() =>
      validate(
        "Users",
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: s.resources.Users[0].userName,
        },
        s,
      ),
    ).toThrow(ScimError);
    expect(() =>
      validate(
        "Users",
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "new@example.com",
          visaStatus: "T",
        },
        s,
      ),
    ).toThrow();
    expect(() =>
      patch(
        {},
        {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "add", path: "__proto__.admin", value: true }],
        },
      ),
    ).toThrow();
  });
});
describe("XML security and signed federation", () => {
  it("rejects DTDs, malformed XML and duplicate IDs", () => {
    expect(() =>
      parseXml('<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///etc/passwd">]><x/>'),
    ).toThrow();
    expect(() => parseXml('<x ID="a"><y ID="a"/></x>')).toThrow();
    expect(() => parseXml("<x><y></x>")).toThrow();
  });
  it("signs metadata with verifiable RSA-SHA256 and detects tampering", () => {
    const xml = signedXml(
      idp("realestate").getMetadata(),
      "/*[local-name()='EntityDescriptor']",
    );
    const sig = new SignedXml({ publicCert: required("SAML_CERTIFICATE") });
    const doc = parseXml(xml);
    sig.loadSignature(
      doc
        .getElementsByTagNameNS(
          "http://www.w3.org/2000/09/xmldsig#",
          "Signature",
        )
        .item(0)!
        .toString(),
    );
    expect(sig.checkSignature(xml)).toBe(true);
    expect(sig.checkSignature(xml.replace("/saml/sso", "/evil/sso"))).toBe(
      false,
    );
  });
  for (const tokenType of ["saml11", "saml20"] as const)
    it(`creates a verifiable WS-Fed ${tokenType} token with audience and lifetime`, () => {
      const app = {
        id: "rp",
        name: "RP",
        realm: "https://rp.example.com",
        replyUrl: "https://rp.example.com/callback",
        tokenType,
      };
      const xml = wsToken(
        "realestate",
        app,
        initial().resources.Users[0],
        ["APP-YARDI-USERS"],
        Math.floor(Date.now() / 1000),
      );
      const doc = parseXml(xml);
      const sig = new SignedXml({ publicCert: required("SAML_CERTIFICATE") });
      sig.loadSignature(
        doc
          .getElementsByTagNameNS(
            "http://www.w3.org/2000/09/xmldsig#",
            "Signature",
          )
          .item(0)!
          .toString(),
      );
      expect(sig.checkSignature(xml)).toBe(true);
      expect(xml).toContain("https://rp.example.com");
      expect(xml).toContain("NotOnOrAfter");
      expect(xml).not.toContain("visa");
    });
  it("creates assertions and responses that a separate SP verifies", async () => {
    const sp = saml.ServiceProvider({
      entityID: "https://sp.example.com",
      wantAssertionsSigned: true,
      wantMessageSigned: true,
      assertionConsumerService: [
        {
          Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
          Location: "https://sp.example.com/acs",
        },
      ],
    });
    const app = {
      id: "sp",
      name: "SP",
      metadata: sp.getMetadata(),
      requireSignedRequests: false,
      encryptAssertions: false,
    };
    const user = initial().resources.Users[0],
      request = { id: "_request" };
    const entity = idp("realestate", app);
    const response = await entity.createLoginResponse(
      sp,
      { extract: { request } },
      "post",
      { email: user.userName },
      {
        customTagReplacement: () =>
          samlTemplate(
            "realestate",
            app,
            request,
            user,
            "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
            Math.floor(Date.now() / 1000),
            ["Test"],
          ),
      },
    );
    const parsed = await sp.parseLoginResponse(entity, "post", {
      body: { SAMLResponse: response.context },
    });
    expect(parsed.extract.nameID).toBe(user.id);
    expect(parsed.extract.attributes?.email).toBe(user.userName);
    expect(parsed.extract.attributes?.groups).toBe("Test");
  });
});
it("requires secure application registrations", () => {
  expect(
    ConfigSchema.safeParse({
      clients: [
        {
          client_id: "a",
          redirect_uris: ["https://rp.example.com"],
          token_endpoint_auth_method: "client_secret_basic",
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    ConfigSchema.safeParse({
      clients: [
        {
          client_id: "a",
          redirect_uris: ["https://rp.example.com"],
          grant_types: ["client_credentials"],
        },
      ],
    }).success,
  ).toBe(false);
});

it("encrypts a signed assertion with an independent SP key and verifies after decryption", async () => {
  const { testKeys } = await import("./keys");
  const keys = testKeys();
  const sp = saml.ServiceProvider({
    entityID: "https://encrypted-sp.example.com",
    wantAssertionsSigned: true,
    wantMessageSigned: true,
    encryptCert: keys.certificate,
    encPrivateKey: keys.privateKey,
    assertionConsumerService: [
      {
        Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        Location: "https://encrypted-sp.example.com/acs",
      },
    ],
  });
  const app = {
      id: "encrypted",
      name: "Encrypted",
      metadata: sp.getMetadata(),
      requireSignedRequests: false,
      encryptAssertions: true,
    },
    entity = idp("realestate", app),
    user = initial().resources.Users[0],
    request = { id: "_encrypted-request" };
  const response = await entity.createLoginResponse(
    sp,
    { extract: { request } },
    "post",
    { email: user.userName },
    {
      encryptThenSign: true,
      customTagReplacement: () =>
        samlTemplate(
          "realestate",
          app,
          request,
          user,
          "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
          Math.floor(Date.now() / 1000),
          ["Test"],
        ),
    },
  );
  const xml = Buffer.from(String(response.context), "base64").toString();
  expect(xml).toContain("EncryptedAssertion");
  expect(xml).toContain("aes256-gcm");
  expect(xml).not.toContain(user.userName);
  const result = await sp.parseLoginResponse(entity, "post", {
    body: { SAMLResponse: response.context },
  });
  expect(result.extract.nameID).toBe(user.id);
});
