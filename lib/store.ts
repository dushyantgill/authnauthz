import { withTestClients } from "./test-clients";
import {
  get,
  head,
  put,
  BlobPreconditionFailedError,
  BlobNotFoundError,
} from "@vercel/blob";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import seed from "../data/summit-ridge.json";
import { seeds } from "./archetypes";
import { ConfigSchema, type TenantConfig, required, tenantId } from "./config";
export type User = (typeof seed.users)[number];
export type Group = (typeof seed.groups)[number];
export type Resource = Record<string, any>;
type Entry = { payload: Resource; expires: number };
export interface State {
  version: number;
  sharedCredential?: { salt: string; hash: string };
  config: TenantConfig;
  resources: { Users: Resource[]; Groups: Resource[] };
  models: Record<string, Entry>;
  events: { at: string; type: string; subject?: string }[];
}
export function initial(t = "realestate"): State {
  const seed = seeds[tenantId(t)];
  return {
    version: 1,
    config: ConfigSchema.parse({
      accountDomains:
        t === "realestate"
          ? undefined
          : {
              employee: t + ".example",
              contractor: "partners." + t + ".example",
            },
    }),
    resources: {
      Users: seed.users.map((u) => ({
        schemas: [
          "urn:ietf:params:scim:schemas:core:2.0:User",
          "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
        ],
        id: u.id,
        userName: u.userName,
        name: u.name,
        displayName: u.displayName,
        active: u.active,
        userType: u.userType,
        title: u.title,
        emails: [{ value: u.userName, type: "work", primary: true }],
        photos: [{ value: u.photo, type: "thumbnail", primary: true }],
        addresses: [{ locality: u.location, country: u.country, type: "work" }],
        phoneNumbers: [{ value: u.phone, type: "work" }],
        "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
          organization: u.organization,
          department: u.department,
          manager: u.manager ? { value: u.manager } : undefined,
        },
        meta: {
          resourceType: "User",
          created: "2026-10-07T00:00:00Z",
          lastModified: "2026-10-07T00:00:00Z",
          version: 'W/"1"',
        },
      })),
      Groups: seed.groups.map((g) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        id: g.id,
        displayName: g.displayName,
        members: g.members,
        meta: {
          resourceType: "Group",
          created: "2026-10-07T00:00:00Z",
          lastModified: "2026-10-07T00:00:00Z",
          version: 'W/"1"',
        },
      })),
    },
    models: {},
    events: [],
  };
}
function refreshDirectoryPresentation(s: State, t: string) {
  let changed = false;
  const baseline = seeds[tenantId(t)],
    users = new Map(baseline.users.map((u) => [u.id, u]));
  function mark(resource: Resource) {
    resource.meta = {
      ...resource.meta,
      lastModified: new Date().toISOString(),
      version: `W/"${s.version + 1}"`,
    };
    changed = true;
  }
  for (const u of s.resources.Users)
    if (!Object.hasOwn(u, "photos") && users.has(u.id)) {
      u.photos = [
        { value: users.get(u.id)!.photo, type: "thumbnail", primary: true },
      ];
      mark(u);
    }
  if (t === "realestate")
    for (const g of s.resources.Groups) {
      if (!/^MGR-[0-9a-f-]{36}$/.test(g.displayName)) continue;
      const manager = s.resources.Users.find(
        (u) => u.id === g.displayName.slice(4),
      );
      if (manager) {
        g.displayName =
          "TEAM-" +
          manager.displayName.toUpperCase().replace(/[^A-Z0-9]+/g, "-") +
          "-DIRECT-REPORTS";
        mark(g);
      }
    }
  return changed;
}
export interface Backend {
  read(path: string): Promise<{ state: State; etag: string } | null>;
  write(path: string, state: State, etag?: string): Promise<void>;
}
export class Conflict extends Error {}
function key() {
  const k = Buffer.from(required("STATE_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw Error("STATE_ENCRYPTION_KEY must encode 32 bytes");
  return k;
}
function seal(s: State) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  const payload = Buffer.concat([c.update(JSON.stringify(s)), c.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    payload: payload.toString("base64"),
  });
}
function open(s: string): State {
  const v = JSON.parse(s);
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(v.iv, "base64"));
  d.setAuthTag(Buffer.from(v.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      d.update(Buffer.from(v.payload, "base64")),
      d.final(),
    ]).toString(),
  );
}
export class BlobBackend implements Backend {
  async read(path: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let before;
      try {
        before = await head(path);
      } catch (e) {
        // Only a confirmed not-found is an empty store; credentials and network errors fail closed.
        if (e instanceof BlobNotFoundError) return null;
        throw e;
      }
      if (!before.etag) throw Error("Blob metadata lacks a concurrency ETag");
      const b = await get(path, { access: "private", useCache: false });
      if (!b || b.statusCode !== 200) continue;
      const state = open(await new Response(b.stream).text());
      if (b.blob.etag === before.etag) return { state, etag: before.etag };
      // Delivery ETags can differ from the object ETag used by conditional writes.
      // Bracket the uncached body read with stable object metadata to avoid pairing old data with a new write version.
      const after = await head(path);
      if (before.etag === after.etag) return { state, etag: after.etag };
    }
    throw new Conflict("Blob changed during read; retry the request");
  }
  async write(path: string, state: State, etag?: string) {
    try {
      await put(path, seal(state), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: !!etag,
        ...(etag ? { ifMatch: etag } : {}),
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError)
        throw new Conflict("Concurrent write");
      throw e;
    }
  }
}
export class MemoryBackend implements Backend {
  data = new Map<string, { state: State; etag: string }>();
  async read(p: string) {
    return structuredClone(this.data.get(p) || null);
  }
  async write(p: string, s: State, e?: string) {
    const old = this.data.get(p);
    if (old?.etag !== e) throw new Conflict();
    this.data.set(p, {
      state: structuredClone(s),
      etag: randomBytes(16).toString("hex"),
    });
  }
}
export class Store {
  constructor(public backend: Backend) {}
  path(t: string) {
    return `authnauthz/v1/${tenantId(t)}/state.enc.json`;
  }
  async read(t: string): Promise<State> {
    const existing = await this.backend.read(this.path(t));
    const s = existing?.state || initial(t);
    s.config = withTestClients(s.config, t);
    if (refreshDirectoryPresentation(s, t) && existing) {
      await this.mutate(t, () => undefined);
      return this.read(t);
    }
    return s;
  }
  async mutate<T>(t: string, fn: (s: State) => T): Promise<T> {
    for (let i = 0; i < 5; i++) {
      const old = await this.backend.read(this.path(t));
      const s = old?.state || initial(t);
      s.config = withTestClients(s.config, t);
      refreshDirectoryPresentation(s, t);
      const now = Date.now();
      for (const [k, v] of Object.entries(s.models))
        if (v.expires < now) delete s.models[k];
      const out = fn(s);
      s.version++;
      try {
        await this.backend.write(this.path(t), s, old?.etag);
        return out;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
      }
    }
    throw new Conflict("Storage busy; retry the request");
  }
  async audit(t: string, type: string, subject?: string) {
    await this.mutate(t, (s) => {
      s.events.unshift({ at: new Date().toISOString(), type, subject });
      s.events = s.events.slice(0, 100);
    });
  }
  async once(t: string, id: string, ttl: number) {
    await this.mutate(t, (s) => {
      const k = "Replay:" + createHash("sha256").update(id).digest("hex");
      if (s.models[k]) throw Error("Replay rejected");
      s.models[k] = { payload: {}, expires: Date.now() + ttl * 1000 };
    });
  }
}
const globalStore = globalThis as typeof globalThis & { authnStore?: Store };
export function store() {
  if (!globalStore.authnStore) {
    if (process.env.STORAGE_MODE === "memory") {
      if (process.env.VERCEL || process.env.NODE_ENV === "production")
        throw Error("Memory storage is local development only");
      globalStore.authnStore = new Store(new MemoryBackend());
    } else {
      required("BLOB_READ_WRITE_TOKEN");
      globalStore.authnStore = new Store(new BlobBackend());
    }
  }
  return globalStore.authnStore;
}
