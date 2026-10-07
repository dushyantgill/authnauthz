import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export function testKeys() {
  const dir = mkdtempSync(join(tmpdir(), "authnauthz-test-"));
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        join(dir, "key"),
        "-out",
        join(dir, "cert"),
        "-days",
        "1",
        "-nodes",
        "-subj",
        "/CN=Independent test SP",
      ],
      { stdio: "ignore" },
    );
    return {
      privateKey: readFileSync(join(dir, "key"), "utf8"),
      certificate: readFileSync(join(dir, "cert"), "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
