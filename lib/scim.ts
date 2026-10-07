import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { parse } from "scim2-parse-filter";
import { store, type Resource, type State } from "./store";
import { scimAuth } from "./security";
import { body } from "./http";
import { origin } from "./config";
import { memberships } from "./membership";
const CORE = "urn:ietf:params:scim:schemas:core:2.0:";
const ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const API = "urn:ietf:params:scim:api:messages:2.0:";
export class ScimError extends Error {
  constructor(
    public status: number,
    message: string,
    public scimType?: string,
  ) {
    super(message);
  }
}
function fail(status: number, msg: string, type?: string): never {
  throw new ScimError(status, msg, type);
}
export function attr(obj: Resource, path: string): any {
  const key = Object.keys(obj).find(
    (k) => k.toLowerCase() === path.toLowerCase(),
  );
  if (key) return obj[key];
  if (path.startsWith("urn:")) {
    const end = path.lastIndexOf(":");
    return attr(obj[path.slice(0, end)] || {}, path.slice(end + 1));
  }
  const [head, ...tail] = path.split(".");
  const k = Object.keys(obj).find(
    (k) => k.toLowerCase() === head.toLowerCase(),
  );
  const v = k ? obj[k] : undefined;
  if (!tail.length) return v;
  if (Array.isArray(v)) return v.flatMap((x) => attr(x, tail.join(".")) ?? []);
  return v && typeof v === "object" ? attr(v, tail.join(".")) : undefined;
}
// Parse the full RFC filter grammar, then evaluate with SCIM caseExact semantics.
export function matches(obj: Resource, f: any): boolean {
  if (f.op === "and") return f.filters.every((x: any) => matches(obj, x));
  if (f.op === "or") return f.filters.some((x: any) => matches(obj, x));
  if (f.op === "not") return !matches(obj, f.filter || f.filters?.[0]);
  if (f.op === "[]") {
    const v = attr(obj, f.attrPath);
    return Array.isArray(v) && v.some((x) => matches(x, f.valFilter));
  }
  const value = attr(obj, f.attrPath);
  if (f.op === "pr")
    return (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0)
    );
  const exact = /^(id|externalId|members.value|schemas)$/i.test(f.attrPath);
  const values = Array.isArray(value) ? value : [value];
  return values.some((v) => {
    let b = f.compValue;
    if (typeof v === "string" && typeof b === "string" && !exact) {
      v = v.toLowerCase();
      b = b.toLowerCase();
    }
    switch (f.op) {
      case "eq":
        return v === b;
      case "ne":
        return v !== undefined && v !== b;
      case "co":
        return typeof v === "string" && v.includes(b);
      case "sw":
        return typeof v === "string" && v.startsWith(b);
      case "ew":
        return typeof v === "string" && v.endsWith(b);
      case "gt":
        return v > b;
      case "ge":
        return v >= b;
      case "lt":
        return v < b;
      case "le":
        return v <= b;
      default:
        fail(400, "Unknown filter operator", "invalidFilter");
    }
  });
}
function filter(s: string) {
  try {
    return parse(s);
  } catch {
    fail(400, "Invalid filter expression", "invalidFilter");
  }
}
const userFields = [
  "externalId",
  "userName",
  "name",
  "displayName",
  "nickName",
  "profileUrl",
  "title",
  "userType",
  "preferredLanguage",
  "locale",
  "timezone",
  "active",
  "emails",
  "phoneNumbers",
  "ims",
  "photos",
  "addresses",
  "entitlements",
  "roles",
  "x509Certificates",
  ENTERPRISE,
];
const groupFields = ["externalId", "displayName", "members"];
const complex: Record<string, string[]> = {
  name: [
    "formatted",
    "familyName",
    "givenName",
    "middleName",
    "honorificPrefix",
    "honorificSuffix",
  ],
  emails: ["value", "display", "type", "primary"],
  phoneNumbers: ["value", "display", "type", "primary"],
  ims: ["value", "display", "type", "primary"],
  photos: ["value", "display", "type", "primary"],
  addresses: [
    "formatted",
    "streetAddress",
    "locality",
    "region",
    "postalCode",
    "country",
    "type",
    "primary",
  ],
  entitlements: ["value", "display", "type", "primary"],
  roles: ["value", "display", "type", "primary"],
  x509Certificates: ["value", "display", "type", "primary"],
  members: ["value", "$ref", "display", "type"],
  [ENTERPRISE]: [
    "employeeNumber",
    "costCenter",
    "organization",
    "division",
    "department",
    "manager",
  ],
  manager: ["value", "$ref", "display"],
};
const banned = ["__proto__", "prototype", "constructor"];
function safe(x: any) {
  if (x && typeof x === "object") {
    for (const k of Object.keys(x)) {
      if (banned.includes(k)) fail(400, "Invalid attribute", "invalidPath");
      safe(x[k]);
    }
  }
}
function canonical(obj: Resource, fields: string[]): Resource {
  const out: Resource = {};
  for (const [key, v] of Object.entries(obj)) {
    const k = fields.find((x) => x.toLowerCase() === key.toLowerCase());
    if (!k) fail(400, `Unsupported attribute: ${key}`, "invalidValue");
    if (complex[k]) {
      const canon = (x: Resource) => {
        if (!x || typeof x !== "object" || Array.isArray(x))
          fail(400, `Invalid ${k}`, "invalidValue");
        return canonical(x, complex[k]);
      };
      out[k] = Array.isArray(v) ? v.map(canon) : v === null ? null : canon(v);
    } else {
      if (v !== null && typeof v === "object")
        fail(400, `Invalid scalar ${k}`, "invalidValue");
      if (
        v !== null &&
        typeof v !== (k === "primary" || k === "active" ? "boolean" : "string")
      )
        fail(400, `Invalid type for ${k}`, "invalidValue");
      out[k] = v;
    }
  }
  return out;
}
export function validate(
  kind: "Users" | "Groups",
  input: Resource,
  s: State,
  id?: string,
): Resource {
  safe(input);
  if (
    !Array.isArray(input.schemas) ||
    !input.schemas.includes(CORE + (kind === "Users" ? "User" : "Group"))
  )
    fail(400, "Missing core schema", "invalidValue");
  if (
    input.schemas.some(
      (x: string) =>
        ![
          CORE + (kind === "Users" ? "User" : "Group"),
          ...(kind === "Users" ? [ENTERPRISE] : []),
        ].includes(x),
    )
  )
    fail(400, "Unsupported schema", "invalidValue");
  const fields = kind === "Users" ? userFields : groupFields;
  const cleaned = { ...input };
  for (const k of Object.keys(cleaned))
    if (
      ["id", "meta", "schemas", "groups"].some(
        (x) => x.toLowerCase() === k.toLowerCase(),
      )
    )
      delete cleaned[k];
  const out = canonical(cleaned, fields);
  out.schemas = [
    CORE + (kind === "Users" ? "User" : "Group"),
    ...(kind === "Users" && out[ENTERPRISE] ? [ENTERPRISE] : []),
  ];
  const required = kind === "Users" ? "userName" : "displayName";
  if (typeof out[required] !== "string" || !out[required].trim())
    fail(400, `${required} is required`, "invalidValue");
  if (kind === "Users") {
    if (
      s.resources.Users.some(
        (u) =>
          u.id !== id &&
          u.userName.toLowerCase() === out.userName.toLowerCase(),
      )
    )
      fail(409, "userName already exists", "uniqueness");
    if (out.active !== undefined && typeof out.active !== "boolean")
      fail(400, "active must be boolean", "invalidValue");
    for (const field of ["name", ENTERPRISE])
      if (Array.isArray(out[field]))
        fail(400, `${field} is single valued`, "invalidValue");
    for (const field of [
      "emails",
      "phoneNumbers",
      "ims",
      "photos",
      "addresses",
      "entitlements",
      "roles",
      "x509Certificates",
    ])
      if (
        out[field] !== undefined &&
        (!Array.isArray(out[field]) ||
          out[field].filter((v: Resource) => v.primary === true).length > 1)
      )
        fail(400, `Invalid ${field}`, "invalidValue");
    const manager = out[ENTERPRISE]?.manager?.value;
    if (manager === id && id)
      fail(400, "A user cannot manage themself", "invalidValue");
    const seen = new Set([id]);
    let parent = manager;
    while (parent) {
      if (seen.has(parent)) fail(400, "Manager cycle", "invalidValue");
      seen.add(parent);
      parent = s.resources.Users.find((u) => u.id === parent)?.[ENTERPRISE]
        ?.manager?.value;
    }
    if (manager && !s.resources.Users.some((u) => u.id === manager))
      fail(400, "Unknown manager", "invalidValue");
  }
  if (kind === "Groups") {
    if (out.members !== undefined && !Array.isArray(out.members))
      fail(400, "members must be an array", "invalidValue");
    for (const m of out.members || []) {
      if (
        !s.resources.Users.some((u) => u.id === m.value) &&
        !s.resources.Groups.some((g) => g.id === m.value)
      )
        fail(400, "Unknown group member", "invalidValue");
    }
    for (const m of out.members || [])
      if (
        m.value === id ||
        (m.value &&
          memberships(s.resources.Groups, id || "").some(
            (g) => g.id === m.value,
          ))
      )
        fail(400, "Group membership cycle", "invalidValue");
    out.members = Array.from(
      new Map((out.members || []).map((m: Resource) => [m.value, m])).values(),
    );
  }
  return out;
}
function setPath(obj: Resource, path: string, v: any, op: string) {
  const k = Object.keys(obj).find(
    (x) => x.toLowerCase() === path.toLowerCase(),
  );
  if (k) {
    if (op === "remove") delete obj[k];
    else if (op === "add" && Array.isArray(obj[k]))
      obj[k] = [...obj[k], ...(Array.isArray(v) ? v : [v])];
    else if (
      op === "add" &&
      typeof obj[k] === "object" &&
      !Array.isArray(obj[k]) &&
      v &&
      typeof v === "object"
    )
      obj[k] = { ...obj[k], ...v };
    else obj[k] = v;
    return;
  }
  let root: string, tail: string;
  if (path.startsWith("urn:")) {
    const end = path.lastIndexOf(":");
    root = path.slice(0, end);
    tail = path.slice(end + 1);
  } else {
    const i = path.indexOf(".");
    if (i < 0) {
      if (op === "remove") fail(400, "No target attribute", "noTarget");
      obj[path] = v;
      return;
    }
    root = path.slice(0, i);
    tail = path.slice(i + 1);
  }
  const r =
    Object.keys(obj).find((x) => x.toLowerCase() === root.toLowerCase()) ||
    root;
  if (!obj[r]) {
    if (op === "remove") fail(400, "No target attribute", "noTarget");
    obj[r] = {};
  }
  if (Array.isArray(obj[r])) for (const x of obj[r]) setPath(x, tail, v, op);
  else setPath(obj[r], tail, v, op);
}
export function patch(current: Resource, b: Resource) {
  if (
    !b.schemas?.includes(API + "PatchOp") ||
    !Array.isArray(b.Operations) ||
    !b.Operations.length
  )
    fail(400, "Invalid PatchOp", "invalidSyntax");
  const out = structuredClone(current);
  for (const o of b.Operations) {
    const op = String(o.op).toLowerCase();
    if (!["add", "remove", "replace"].includes(op))
      fail(400, "Invalid PATCH operation", "invalidSyntax");
    if (op !== "remove" && o.value === undefined)
      fail(400, "PATCH value required", "invalidSyntax");
    if (!o.path) {
      if (op === "remove" || !o.value || typeof o.value !== "object")
        fail(400, "PATCH value is required", "invalidSyntax");
      for (const [k, v] of Object.entries(o.value)) setPath(out, k, v, op);
      continue;
    }
    if (
      typeof o.path !== "string" ||
      banned.some((x) => o.path.toLowerCase().includes(x))
    )
      fail(400, "Invalid path", "invalidPath");
    if (/^(id|meta|schemas|groups)(\.|$)/i.test(o.path))
      fail(400, "Read-only attribute", "mutability");
    const match = o.path.match(/^([^\[]+)\[(.+)\](?:\.(.+))?$/);
    if (match) {
      const [, root, expression, sub] = match;
      const array = attr(out, root);
      const ast = filter(expression);
      if (!Array.isArray(array)) fail(400, "No PATCH target", "noTarget");
      const found = array.filter((x) => matches(x, ast));
      if (!found.length) fail(400, "No PATCH target", "noTarget");
      if (sub) for (const x of found) setPath(x, sub, o.value, op);
      else if (op === "remove")
        setPath(
          out,
          root,
          array.filter((x) => !matches(x, ast)),
          "replace",
        );
      else {
        const value = Array.isArray(o.value) ? o.value : [o.value];
        setPath(
          out,
          root,
          array.flatMap((x) =>
            matches(x, ast) ? (op === "replace" ? value : [x, ...value]) : [x],
          ),
          "replace",
        );
      }
    } else setPath(out, o.path, o.value, op);
  }
  return out;
}
function projection(r: Resource, q: Resource) {
  const attrs = String(q.attributes || "")
      .split(",")
      .filter(Boolean),
    excluded = String(q.excludedAttributes || "")
      .split(",")
      .filter(Boolean);
  if (attrs.length && excluded.length)
    fail(400, "Use attributes or excludedAttributes", "invalidSyntax");
  if (attrs.length) {
    const out: Resource = { schemas: r.schemas, id: r.id };
    for (const p of attrs) {
      const v = attr(r, p);
      if (v !== undefined) setPath(out, p, v, "replace");
    }
    return out;
  }
  const out = structuredClone(r);
  for (const p of excluded)
    if (
      !["id", "schemas"].includes(p.toLowerCase()) &&
      attr(out, p) !== undefined
    )
      setPath(out, p, null, "remove");
  return out;
}
function decorated(t: string, k: string, r: Resource, s: State) {
  const out = structuredClone(r);
  out.meta.location = `${origin()}/api/t/${t}/scim/${k}/${r.id}`;
  if (k === "Users")
    out.groups = memberships(s.resources.Groups, r.id).map((g) => ({
      value: g.id,
      display: g.displayName,
      type: g.members?.some((m: Resource) => m.value === r.id)
        ? "direct"
        : "indirect",
      $ref: `${origin()}/api/t/${t}/scim/Groups/${g.id}`,
    }));
  return out;
}
const attrSchema = (
  name: string,
  type = "string",
  multiValued = false,
  extra: Resource = {},
) => ({
  name,
  type,
  multiValued,
  description: name,
  required: false,
  caseExact: ["id", "externalId"].includes(name),
  mutability: "readWrite",
  returned: "default",
  uniqueness: "none",
  ...extra,
});
function schema(kind: "Users" | "Groups") {
  const fields =
    kind === "Users" ? userFields.filter((x) => x !== ENTERPRISE) : groupFields;
  return {
    schemas: [CORE + "Schema"],
    id: CORE + (kind === "Users" ? "User" : "Group"),
    name: kind === "Users" ? "User" : "Group",
    description: "SCIM core resource",
    attributes: fields.map((name) =>
      attrSchema(
        name,
        complex[name] ? "complex" : name === "active" ? "boolean" : "string",
        !!complex[name] && name !== "name",
        {
          ...(complex[name]
            ? {
                subAttributes: complex[name].map((n) =>
                  attrSchema(n, n === "primary" ? "boolean" : "string"),
                ),
              }
            : {}),
          required: name === (kind === "Users" ? "userName" : "displayName"),
          uniqueness: name === "userName" ? "server" : "none",
        },
      ),
    ),
  };
}
export async function scim(
  t: string,
  path: string[],
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Content-Type", "application/scim+json");
  // Next res.json generates an unrelated ETag; keep the SCIM resource version.
  res.json = (data: unknown) => {
    res.end(JSON.stringify(data));
    return res;
  };
  if (!scimAuth(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(401).json({
      schemas: [API + "Error"],
      status: "401",
      detail: "Bearer token required",
    });
  }
  try {
    const [kind, id] = path;
    const base = `${origin()}/api/t/${t}/scim`;
    if (kind === "ServiceProviderConfig" && req.method === "GET")
      return res.json({
        schemas: [CORE + "ServiceProviderConfig"],
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 1000 },
        changePassword: { supported: false },
        sort: { supported: true },
        etag: { supported: true },
        authenticationSchemes: [
          {
            type: "oauthbearertoken",
            name: "Bearer token",
            description: "Tenant-scoped SCIM bearer credential",
            primary: true,
          },
        ],
      });
    if (kind === "Schemas" && req.method === "GET") {
      const all = [
        schema("Users"),
        schema("Groups"),
        {
          schemas: [CORE + "Schema"],
          id: ENTERPRISE,
          name: "EnterpriseUser",
          description: "Enterprise organizational attributes",
          attributes: complex[ENTERPRISE].map((n) =>
            attrSchema(
              n,
              n === "manager" ? "complex" : "string",
              false,
              n === "manager"
                ? { subAttributes: complex.manager.map((n) => attrSchema(n)) }
                : {},
            ),
          ),
        },
      ];
      if (id) {
        const r = all.find((s) => s.id === id);
        if (!r) fail(404, "Unknown schema");
        return res.json(r);
      }
      return res.json({
        schemas: [API + "ListResponse"],
        totalResults: all.length,
        startIndex: 1,
        itemsPerPage: all.length,
        Resources: all,
      });
    }
    if (kind === "ResourceTypes" && req.method === "GET") {
      const all = ["User", "Group"].map((n) => ({
        schemas: [CORE + "ResourceType"],
        id: n,
        name: n,
        endpoint: "/" + n + "s",
        schema: CORE + n,
        ...(n === "User"
          ? { schemaExtensions: [{ schema: ENTERPRISE, required: false }] }
          : {}),
      }));
      if (id) {
        const r = all.find((s) => s.id === id);
        if (!r) fail(404, "Unknown resource type");
        return res.json(r);
      }
      return res.json({
        schemas: [API + "ListResponse"],
        totalResults: 2,
        startIndex: 1,
        itemsPerPage: 2,
        Resources: all,
      });
    }
    if (!["Users", "Groups"].includes(kind)) fail(404, "Unknown endpoint");
    const k = kind as "Users" | "Groups";
    const search =
      req.method === "POST" && (id === ".search" || path[1] === ".search");
    if (req.method === "GET" || search) {
      const s = await store().read(t);
      if (id && !search) {
        const r = s.resources[k].find((x) => x.id === id);
        if (!r) fail(404, "Resource not found");
        res.setHeader("ETag", r.meta.version);
        if (req.headers["if-none-match"] === r.meta.version)
          return res.status(304).end();
        return res.json(projection(decorated(t, k, r, s), req.query));
      }
      const q = search ? await body(req) : req.query;
      if (search && !q.schemas?.includes(API + "SearchRequest"))
        fail(400, "Invalid SearchRequest", "invalidSyntax");
      let all = s.resources[k].map((r) => decorated(t, k, r, s));
      if (q.filter) {
        const f = filter(String(q.filter));
        all = all.filter((r) => matches(r, f));
      }
      if (q.sortBy) {
        const sign = q.sortOrder === "descending" ? -1 : 1;
        all.sort(
          (a, b) =>
            String(attr(a, q.sortBy) || "").localeCompare(
              String(attr(b, q.sortBy) || ""),
            ) * sign,
        );
      }
      if (
        (q.startIndex !== undefined &&
          !Number.isInteger(Number(q.startIndex))) ||
        (q.count !== undefined && !Number.isInteger(Number(q.count)))
      )
        fail(400, "Invalid pagination", "invalidValue");
      if (
        q.sortOrder !== undefined &&
        !["ascending", "descending"].includes(q.sortOrder)
      )
        fail(400, "Invalid sortOrder", "invalidValue");
      const start = Math.max(1, Number(q.startIndex) || 1),
        count = Math.max(
          0,
          Math.min(1000, q.count === undefined ? 100 : Number(q.count)),
        );
      if (!Number.isInteger(start) || !Number.isInteger(count))
        fail(400, "Invalid pagination", "invalidValue");
      const resources = all
        .slice(start - 1, start - 1 + count)
        .map((r) => projection(r, q));
      return res.json({
        schemas: [API + "ListResponse"],
        totalResults: all.length,
        startIndex: start,
        itemsPerPage: resources.length,
        Resources: resources,
      });
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE");
      fail(405, "Method not allowed");
    }
    if ((req.method === "POST" && id) || (req.method !== "POST" && !id))
      fail(405, "Invalid resource operation");
    const b = req.method === "DELETE" ? {} : await body(req);
    let status =
      req.method === "POST" ? 201 : req.method === "DELETE" ? 204 : 200;
    const result = await store().mutate(t, (s) => {
      const ix = id ? s.resources[k].findIndex((r) => r.id === id) : -1;
      const old = ix >= 0 ? s.resources[k][ix] : undefined;
      if (id && !old) fail(404, "Resource not found");
      if (
        req.headers["if-match"] &&
        req.headers["if-match"] !== "*" &&
        req.headers["if-match"] !== old?.meta.version
      )
        fail(412, "ETag mismatch");
      const now = new Date().toISOString();
      const touch = (r: Resource) => {
        r.meta.lastModified = now;
        r.meta.version = `W/"${s.version + 1}"`;
      };
      const beforeGroups = new Map(
        s.resources.Users.map((u) => [
          u.id,
          JSON.stringify(
            memberships(s.resources.Groups, u.id).map((g) => [
              g.id,
              g.displayName,
              g.members?.some((m: Resource) => m.value === u.id),
            ]),
          ),
        ]),
      );
      const touchMemberships = () => {
        for (const u of s.resources.Users)
          if (
            beforeGroups.get(u.id) !==
            JSON.stringify(
              memberships(s.resources.Groups, u.id).map((g) => [
                g.id,
                g.displayName,
                g.members?.some((m: Resource) => m.value === u.id),
              ]),
            )
          )
            touch(u);
      };
      if (req.method === "DELETE") {
        s.resources[k].splice(ix, 1);
        for (const g of s.resources.Groups)
          if (g.members?.some((m: Resource) => m.value === id)) {
            g.members = g.members.filter((m: Resource) => m.value !== id);
            touch(g);
          }
        if (k === "Users")
          for (const u of s.resources.Users)
            if (u[ENTERPRISE]?.manager?.value === id) {
              delete u[ENTERPRISE].manager;
              touch(u);
            }
        touchMemberships();
        if (k === "Users")
          for (const [key, e] of Object.entries(s.models))
            if (e.payload.accountId === id) delete s.models[key];
        s.events.unshift({ at: now, type: "scim.delete", subject: id });
        s.events = s.events.slice(0, 100);
        return undefined;
      }
      const input = req.method === "PATCH" ? patch(old!, b) : b;
      const next = validate(k, input, s, id);
      next.id = id || randomUUID();

      next.meta = {
        resourceType: k === "Users" ? "User" : "Group",
        created: old?.meta.created || now,
        lastModified: now,
        version: `W/"${s.version + 1}"`,
      };
      if (ix >= 0) s.resources[k][ix] = next;
      else s.resources[k].push(next);
      touchMemberships();
      if (k === "Users" && !next.active)
        for (const [key, e] of Object.entries(s.models))
          if (e.payload.accountId === next.id) delete s.models[key];
      s.events.unshift({
        at: now,
        type: "scim." + req.method?.toLowerCase(),
        subject: next.id,
      });
      s.events = s.events.slice(0, 100);
      return decorated(t, k, next, s);
    });
    if (result) {
      res.setHeader("ETag", result.meta.version);
      res.setHeader("Location", result.meta.location);
      return res.status(status).json(projection(result, req.query));
    }
    return res.status(status).end();
  } catch (e) {
    if (e instanceof SyntaxError)
      return res.status(400).json({
        schemas: [API + "Error"],
        status: "400",
        detail: "Malformed JSON",
        scimType: "invalidSyntax",
      });
    if (e instanceof ScimError)
      return res.status(e.status).json({
        schemas: [API + "Error"],
        status: String(e.status),
        detail: e.message,
        ...(e.scimType ? { scimType: e.scimType } : {}),
      });
    throw e;
  }
}
