import { beforeEach, it, expect, vi } from "vitest";
const blob = vi.hoisted(() => ({
  files: new Map<string, { text: string; etag: string }>(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@vercel/blob", () => {
  class BlobPreconditionFailedError extends Error {}
  return { BlobPreconditionFailedError, get: blob.get, put: blob.put };
});
import { BlobBackend, Store } from "../lib/store";
import { BlobPreconditionFailedError } from "@vercel/blob";
beforeEach(() => {
  blob.files.clear();
  blob.get.mockReset();
  blob.put.mockReset();
  blob.get.mockImplementation(async (path: string, options: any) => {
    expect(options).toMatchObject({ access: "private", useCache: false });
    const file = blob.files.get(path);
    return file
      ? {
          statusCode: 200,
          stream: new Response(file.text).body,
          blob: { etag: file.etag },
        }
      : null;
  });
  blob.put.mockImplementation(
    async (path: string, text: string, options: any) => {
      expect(options.access).toBe("private");
      expect(options.addRandomSuffix).toBe(false);
      expect(options.cacheControlMaxAge).toBe(0);
      const old = blob.files.get(path);
      if (old && (!options.ifMatch || old.etag !== options.ifMatch))
        throw new BlobPreconditionFailedError();
      const etag = '"' + (Number(old?.etag.replace(/"/g, "") || 0) + 1) + '"';
      blob.files.set(path, { text, etag });
      return { etag };
    },
  );
});
it("persists only authenticated ciphertext and round-trips directory and configuration", async () => {
  const s = new Store(new BlobBackend());
  await s.mutate("realestate", (state) => {
    state.config.persona = "entra";
  });
  const file = blob.files.get(s.path("realestate"))!;
  expect(file.text).not.toContain("summitridge");
  expect(file.text).not.toContain("models");
  expect((await s.read("realestate")).config.persona).toBe("entra");
  expect((await s.read("realestate")).resources.Users).toHaveLength(267);
});
it("retries ETag conflicts after reading fresh origin data without losing another writer", async () => {
  const s = new Store(new BlobBackend());
  await s.mutate("realestate", () => {});
  const original = blob.put.getMockImplementation()!;
  let injected = false; // Inject a genuine competing write through the backend so encryption and ETags remain real.
  blob.put.mockImplementation(
    async (path: string, text: string, options: any) => {
      if (!injected) {
        injected = true;
        const b = new BlobBackend();
        const old = await b.read(path);
        old!.state.events.push({ at: "now", type: "other-writer" });
        blob.put.mockImplementation(original);
        await b.write(path, old!.state, old!.etag);
        throw new BlobPreconditionFailedError();
      }
      return original(path, text, options);
    },
  );
  await s.mutate("realestate", (state) => {
    state.events.push({ at: "now", type: "this-writer" });
  });
  expect((await s.read("realestate")).events.map((e) => e.type)).toEqual([
    "other-writer",
    "this-writer",
  ]);
});
it("fails closed when a blob is corrupted or authentication fails", async () => {
  const b = new BlobBackend(),
    s = new Store(b);
  await s.mutate("realestate", () => {});
  const f = blob.files.get(s.path("realestate"))!;
  const envelope = JSON.parse(f.text);
  envelope.tag = Buffer.alloc(16).toString("base64");
  f.text = JSON.stringify(envelope);
  await expect(s.read("realestate")).rejects.toThrow();
});
it("allows exactly one concurrent replay reservation through the Blob backend", async () => {
  const s = new Store(new BlobBackend());
  await s.mutate("realestate", () => {});
  const results = await Promise.allSettled([
    s.once("realestate", "same-id", 30),
    s.once("realestate", "same-id", 30),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
