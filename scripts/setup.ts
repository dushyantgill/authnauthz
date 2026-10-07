import { generateKeyPairSync, randomBytes, scryptSync } from "node:crypto";
import { exportJWK } from "jose";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (existsSync(".env.local"))
  throw Error(
    ".env.local already exists; preserve your keys or remove it deliberately before regenerating",
  );
const tmp = mkdtempSync(join(tmpdir(), "authnauthz-"));
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-keyout",
      join(tmp, "key.pem"),
      "-out",
      join(tmp, "cert.pem"),
      "-days",
      "365",
      "-nodes",
      "-subj",
      "/CN=AuthNAuthZ Summit Ridge Simulation",
    ],
    { stdio: "ignore" },
  );
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  const jwk = await exportJWK(privateKey);
  Object.assign(jwk, {
    kid: randomBytes(16).toString("hex"),
    use: "sig",
    alg: "RS256",
  });
  const password = randomBytes(24).toString("base64url"),
    salt = randomBytes(16).toString("hex");
  const vars = {
    APP_URL: "http://localhost:3000",
    STORAGE_MODE: "memory",
    BLOB_READ_WRITE_TOKEN: "",
    ADMIN_TOKEN: randomBytes(32).toString("base64url"),
    SCIM_TOKEN: randomBytes(32).toString("base64url"),
    COOKIE_SECRET: randomBytes(48).toString("base64url"),
    STATE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    SIMULATION_PASSWORD_HASH: JSON.stringify({
      salt,
      hash: scryptSync(password, salt, 32).toString("hex"),
    }),
    OIDC_JWKS: JSON.stringify({ keys: [jwk] }),
    SAML_PRIVATE_KEY: readFileSync(join(tmp, "key.pem"), "utf8").replace(
      /\n/g,
      "\\n",
    ),
    SAML_CERTIFICATE: readFileSync(join(tmp, "cert.pem"), "utf8").replace(
      /\n/g,
      "\\n",
    ),
  };
  writeFileSync(
    ".env.local",
    Object.entries(vars)
      .map(([k, v]) => `${k}='${v}'`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  writeFileSync(".simulation-password", password + "\n", { mode: 0o600 });
  console.log(
    "Created .env.local and .simulation-password (both ignored by Git). Read the latter for your local simulation login password. For Vercel use STORAGE_MODE=blob and set the private Blob token.",
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
