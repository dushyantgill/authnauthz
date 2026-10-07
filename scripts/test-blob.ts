import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { del } from "@vercel/blob";
import { BlobBackend, Store } from "../lib/store";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.BLOB_READ_WRITE_TOKEN)
  throw Error(
    "Set a private BLOB_READ_WRITE_TOKEN and STATE_ENCRYPTION_KEY before running the live Blob smoke test",
  );
const path = `authnauthz/validation/${randomUUID()}/state.enc.json`;
class ValidationStore extends Store {
  path() {
    return path;
  }
}
const backend = new BlobBackend(),
  s = new ValidationStore(backend);
try {
  await s.mutate("realestate", () => {});
  const results = await Promise.allSettled([
    s.once("realestate", "concurrent-proof", 60),
    s.once("realestate", "concurrent-proof", 60),
  ]);
  if (results.filter((r) => r.status === "fulfilled").length !== 1)
    throw Error("Atomic replay test failed");
  const state = await s.read("realestate");
  if (state.resources.Users.length !== 267) throw Error("Round-trip failed");
  console.log(
    "Live private Blob read, authenticated encryption, conditional writes and concurrent replay test passed.",
  );
} finally {
  const last = await backend.read(path);
  if (last) await del(path, { ifMatch: last.etag });
}
