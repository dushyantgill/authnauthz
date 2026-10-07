import Provider, { errors } from "oidc-provider";
import { memberships } from "./membership";
import { revokeSessions } from "./security";
import type { AdapterPayload } from "oidc-provider";
import { issuer, required } from "./config";
import { store } from "./store";
export function adapter(tenant: string) {
  return class {
    constructor(private name: string) {}
    key(id: string) {
      return `${this.name}:${id}`;
    }
    async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
      await store().mutate(tenant, (s) => {
        const k = this.key(id);
        const old = s.models[k];
        if (this.name === "ReplayDetection" && old)
          throw new errors.InvalidRequest("Replay rejected");
        if (old?.payload.consumed && !payload.consumed)
          throw Error("Consumed credential cannot be resurrected");
        s.models[k] = { payload, expires: Date.now() + expiresIn * 1000 };
      });
    }
    async find(id: string) {
      const e = (await store().read(tenant)).models[this.key(id)];
      return e && e.expires > Date.now() ? e.payload : undefined;
    }
    async findByUserCode(code: string) {
      return this.lookup("userCode", code);
    }
    async findByUid(uid: string) {
      return this.lookup("uid", uid);
    }
    async lookup(field: string, v: string) {
      return Object.entries((await store().read(tenant)).models).find(
        ([k, e]) =>
          k.startsWith(this.name + ":") &&
          e.expires > Date.now() &&
          e.payload[field] === v,
      )?.[1].payload;
    }
    async destroy(id: string) {
      await store().mutate(tenant, (s) => {
        delete s.models[this.key(id)];
      });
    }
    async consume(id: string) {
      await store().mutate(tenant, (s) => {
        const e = s.models[this.key(id)];
        if (!e || e.payload.consumed)
          throw new errors.InvalidGrant("Credential already consumed");
        e.payload.consumed = Math.floor(Date.now() / 1000);
      });
    }
    async revokeByGrantId(id: string) {
      await store().mutate(tenant, (s) => {
        for (const [k, e] of Object.entries(s.models))
          if (e.payload.grantId === id) delete s.models[k];
      });
    }
  };
}
const cache = new Map<string, { fingerprint: string; provider: Provider }>();
export async function provider(t: string) {
  const state = await store().read(t);
  const fingerprint = JSON.stringify([
    state.config.clients,
    state.config.persona,
  ]);
  const existing = cache.get(t);
  if (existing?.fingerprint === fingerprint) return existing.provider;
  const p = new Provider(issuer(t), {
    adapter: adapter(t),
    clients: state.config.clients,
    jwks: JSON.parse(required("OIDC_JWKS")),
    cookies: { keys: required("COOKIE_SECRET").split(",") },
    features: {
      devInteractions: { enabled: false },
      introspection: { enabled: true },
      revocation: { enabled: true },
      clientCredentials: { enabled: true },
      rpInitiatedLogout: { enabled: true },
    },
    responseTypes: ["code"],
    scopes: ["openid", "profile", "email", "offline_access", "groups"],
    claims: {
      openid: ["sub"],
      profile: [
        "name",
        "given_name",
        "family_name",
        "preferred_username",
        "upn",
        "oid",
        "tid",
      ],
      email: ["email", "email_verified"],
      groups: ["groups"],
    },
    pkce: { required: () => true },
    rotateRefreshToken: true,
    ttl: {
      AccessToken: 900,
      ClientCredentials: 900,
      AuthorizationCode: 60,
      IdToken: 900,
      RefreshToken: 86400,
      Session: 3600,
      Interaction: 300,
      Grant: 86400,
    },
    interactions: {
      url: (_ctx, interaction) => `/api/t/${t}/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, id) => {
      const s = await store().read(t),
        u = s.resources.Users.find((u) => u.id === id && u.active);
      if (!u) return undefined;
      return {
        accountId: id,
        claims: async () => ({
          sub: id,
          name: u.displayName,
          given_name: u.name?.givenName,
          family_name: u.name?.familyName,
          preferred_username: u.userName,
          email: u.emails?.[0]?.value,
          email_verified: true,
          ...(s.config.persona === "entra"
            ? {
                oid: id,
                tid: "78b7bc8f-a9b7-5916-a77d-c65c85b89eac",
                upn: u.userName,
              }
            : {}),
          groups: memberships(s.resources.Groups, id).map((g) =>
            s.config.persona === "entra" ? g.id : g.displayName,
          ),
        }),
      };
    },
    renderError: async (ctx, out) => {
      ctx.type = "application/json";
      ctx.body = out;
    },
  });
  p.use(async (ctx, next) => {
    await next();
    if (
      ctx.oidc?.route === "end_session_confirm" &&
      ctx.status === 303 &&
      ctx.oidc.params.logout
    ) {
      const id = ctx.oidc.session.accountId;
      if (id) await revokeSessions(t, id);
      ctx.cookies.set("authnauthz_session", null, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: ctx.secure,
      });
    }
  });
  p.proxy = true;
  cache.set(t, { fingerprint, provider: p });
  return p;
}
