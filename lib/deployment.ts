import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { origin } from "./config";
const names = [
  "APP_URL",
  "STORAGE_MODE",
  "BLOB_READ_WRITE_TOKEN",
  "ADMIN_TOKEN",
  "SCIM_TOKEN",
  "COOKIE_SECRET",
  "STATE_ENCRYPTION_KEY",
  "SIMULATION_PASSWORD_HASH",
  "OIDC_JWKS",
  "SAML_PRIVATE_KEY",
  "SAML_CERTIFICATE",
];
export function deploymentStatus(runtimePassword = false) {
  const issues: string[] = [];
  const variables = names.map((name) => ({
    name,
    configured: !!process.env[name],
  }));
  for (const { name, configured } of variables)
    if (
      !configured &&
      !(name === "SIMULATION_PASSWORD_HASH" && runtimePassword) &&
      !(
        name === "BLOB_READ_WRITE_TOKEN" &&
        process.env.STORAGE_MODE === "memory" &&
        !process.env.VERCEL
      )
    )
      issues.push(`${name} is missing.`);
  let url = "";
  try {
    url = origin();
    if (process.env.VERCEL && !process.env.APP_URL)
      throw Error("APP_URL is missing");
  } catch {
    issues.push(
      "Set APP_URL to the canonical HTTPS origin (https://www.authnauthz.com in Production).",
    );
  }
  if (process.env.VERCEL && process.env.STORAGE_MODE !== "blob")
    issues.push("Set STORAGE_MODE to blob on Vercel.");
  if (
    process.env.STATE_ENCRYPTION_KEY &&
    Buffer.from(process.env.STATE_ENCRYPTION_KEY, "base64").length !== 32
  )
    issues.push("STATE_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  let certificate: null | {
    pem: string;
    fingerprint: string;
    expires: string;
  } = null;
  if (process.env.SAML_CERTIFICATE) {
    try {
      const pem = process.env.SAML_CERTIFICATE.replace(/\\n/g, "\n");
      const cert = new X509Certificate(pem);
      certificate = {
        pem,
        fingerprint: cert.fingerprint256,
        expires: cert.validTo,
      };
      if (Date.parse(cert.validTo) < Date.now())
        issues.push("The SAML signing certificate has expired.");
      if (process.env.SAML_PRIVATE_KEY) {
        const priv = createPrivateKey(
          process.env.SAML_PRIVATE_KEY.replace(/\\n/g, "\n"),
        );
        if (!cert.checkPrivateKey(priv))
          issues.push("The SAML private key does not match its certificate.");
      }
    } catch {
      issues.push("SAML signing key or certificate is invalid.");
    }
  }
  let jwks: { keys: Record<string, unknown>[] } | null = null;
  if (process.env.OIDC_JWKS) {
    try {
      const configured = JSON.parse(process.env.OIDC_JWKS);
      if (!Array.isArray(configured.keys) || !configured.keys.length)
        throw Error();
      jwks = {
        keys: configured.keys.map((key: any) => {
          const priv = createPrivateKey({ key, format: "jwk" });
          const pub = createPublicKey(priv).export({ format: "jwk" });
          return { ...pub, kid: key.kid, use: key.use, alg: key.alg };
        }),
      };
    } catch {
      issues.push("OIDC_JWKS must contain valid private signing keys.");
    }
  }
  return {
    simulationPasswordConfigured:
      runtimePassword || !!process.env.SIMULATION_PASSWORD_HASH,
    origin: url,
    storageMode: process.env.STORAGE_MODE || "blob",
    variables,
    issues,
    certificate,
    jwks,
  };
}
