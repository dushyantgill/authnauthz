import { z } from "zod";
const endpoint = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === "https:" ||
      (!process.env.VERCEL && ["localhost", "127.0.0.1"].includes(u.hostname))
    );
  }, "HTTPS required");
export const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "Enter a domain such as example.com, without @ or a URL",
  );
export const AccountDomainsSchema = z.object({
  employee: DomainSchema,
  contractor: DomainSchema,
});
export const ConfigSchema = z
  .object({
    accountDomains: AccountDomainsSchema.default({
      employee: "summitridge.example",
      contractor: "summitridge.example",
    }),
    persona: z.enum(["generic", "entra", "okta", "adfs"]).default("generic"),
    clients: z
      .array(
        z
          .object({
            client_id: z.string().regex(/^[\w-]{1,80}$/),
            client_secret: z.string().min(32).optional(),
            redirect_uris: z.array(endpoint).min(1),
            post_logout_redirect_uris: z.array(endpoint).default([]),
            grant_types: z
              .array(
                z.enum([
                  "authorization_code",
                  "refresh_token",
                  "client_credentials",
                ]),
              )
              .default(["authorization_code"]),
            response_types: z.array(z.literal("code")).default(["code"]),
            token_endpoint_auth_method: z
              .enum([
                "none",
                "client_secret_basic",
                "client_secret_post",
                "private_key_jwt",
              ])
              .default("none"),
            jwks: z
              .object({ keys: z.array(z.record(z.string(), z.unknown())) })
              .optional(),
          })
          .superRefine((c, ctx) => {
            if (
              c.token_endpoint_auth_method.startsWith("client_secret") &&
              !c.client_secret
            )
              ctx.addIssue({
                code: "custom",
                message: "Confidential clients need a secret",
              });
            if (c.token_endpoint_auth_method === "private_key_jwt" && !c.jwks)
              ctx.addIssue({
                code: "custom",
                message: "private_key_jwt needs public JWKS",
              });
            if (
              c.grant_types.includes("client_credentials") &&
              c.token_endpoint_auth_method === "none"
            )
              ctx.addIssue({
                code: "custom",
                message: "Client credentials require authentication",
              });
          }),
      )
      .default([]),
    samlApps: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,80}$/),
          name: z.string().min(1),
          metadata: z.string().max(200000),
          requireSignedRequests: z.boolean().default(true),
          encryptAssertions: z.boolean().default(false),
        }),
      )
      .default([]),
    wsfedApps: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,80}$/),
          name: z.string(),
          realm: z.string().url(),
          replyUrl: endpoint,
          tokenType: z.enum(["saml11", "saml20"]).default("saml11"),
        }),
      )
      .default([]),
  })
  .superRefine((c, ctx) => {
    for (const list of [
      c.clients.map((x) => x.client_id),
      c.samlApps.map((x) => x.id),
      c.wsfedApps.map((x) => x.realm),
    ])
      if (new Set(list).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate application identifier",
        });
  });
export type TenantConfig = z.infer<typeof ConfigSchema>;
export function origin() {
  const s = process.env.APP_URL || "http://localhost:3000";
  const u = new URL(s);
  if (process.env.VERCEL && u.protocol !== "https:")
    throw Error("APP_URL must be HTTPS on Vercel");
  if (u.pathname !== "/" || u.search || u.hash)
    throw Error("APP_URL must be an origin");
  return u.origin;
}
export function tenantId(t: string) {
  if (t !== "realestate") throw Error("Unknown tenant");
  return t;
}
export function issuer(t = "realestate") {
  return `${origin()}/api/t/${tenantId(t)}/oidc`;
}
export function required(name: string) {
  const s = process.env[name];
  if (!s) throw Error(`Missing ${name}; run npm run setup`);
  return s.replace(/\\n/g, "\n");
}
