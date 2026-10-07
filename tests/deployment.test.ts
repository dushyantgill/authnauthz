import { it, expect, vi, afterEach } from "vitest";
import { deploymentStatus } from "../lib/deployment";
afterEach(() => vi.unstubAllEnvs());
it("reports an invalid Production origin without leaking private signing keys or tokens", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  const s = deploymentStatus();
  expect(s.issues.some((i) => i.includes("canonical HTTPS"))).toBe(true);
  expect(s.jwks?.keys.length).toBeGreaterThan(0);
  const text = JSON.stringify(s);
  expect(text).not.toContain(process.env.ADMIN_TOKEN);
  expect(text).not.toContain(process.env.SCIM_TOKEN);
  expect(text).not.toContain("PRIVATE KEY");
  for (const k of s.jwks!.keys)
    for (const field of ["d", "p", "q", "dp", "dq", "qi"])
      expect(k).not.toHaveProperty(field);
});
