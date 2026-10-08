import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { seeds } from "../lib/archetypes";
import original from "../data/summit-ridge.json";
import { initial, Store, MemoryBackend } from "../lib/store";
it("retains all source JPEGs and profile links across all three directories", () => {
  const published = JSON.parse(readFileSync("public/photos/status.json", "utf8"));
  for (const path of published.available) expect(existsSync("public" + path)).toBe(true);
  expect(published.available.length + published.pending).toBe(published.expected);
  for (const seed of Object.values(seeds))
    for (const u of seed.users) {
      if (!existsSync("public" + u.photo)) continue;
      expect(readFileSync("public" + u.photo).subarray(0, 3)).toEqual(
        Buffer.from([255, 216, 255]),
      );
    }
});
it("migrates stored profile links and manager labels without changing IDs, memberships or custom photos", async () => {
  const backend = new MemoryBackend(),
    store = new Store(backend),
    state = initial();
  for (const u of state.resources.Users) delete u.photos;
  state.resources.Users[0].photos = [
    { value: "/custom.jpg", type: "thumbnail" },
  ];
  for (const g of state.resources.Groups)
    g.displayName = original.groups.find((b) => b.id === g.id)!.displayName;
  const memberships = state.resources.Groups.map((g) => ({
    id: g.id,
    members: structuredClone(g.members),
  }));
  state.config.accountDomains = {
    employee: "limekube.com",
    contractor: "vendors.example",
  };
  await backend.write(store.path("realestate"), state);
  const migrated = await store.read("realestate");
  expect(migrated.resources.Users[0].photos[0].value).toBe("/custom.jpg");
  expect(migrated.resources.Users.every((u) => u.photos?.length)).toBe(true);
  expect(
    migrated.resources.Groups.some((g) => g.displayName.startsWith("MGR-")),
  ).toBe(false);
  expect(
    migrated.resources.Groups.map((g) => ({ id: g.id, members: g.members })),
  ).toEqual(memberships);
  expect(migrated.resources.Groups).toHaveLength(185);
  expect(migrated.config.accountDomains.employee).toBe("limekube.com");
  const persisted = await backend.read(store.path("realestate"));
  expect(persisted!.state.resources.Groups).toEqual(migrated.resources.Groups);
  expect((await store.read("realestate")).version).toBe(migrated.version);
});
