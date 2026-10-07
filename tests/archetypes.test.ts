import { it, expect } from "vitest";
import { archetypes, seeds } from "../lib/archetypes";
import { Store, MemoryBackend, initial } from "../lib/store";
import { loginBrand } from "../lib/login-brand";
import { applyAccountDomains } from "../lib/domains";
import { tenantId } from "../lib/config";
for (const tenant of ["biotech", "insurance"] as const) {
  it(`${tenant} has a complete hierarchy, accountable vendors and valid purpose groups`, () => {
    const seed = seeds[tenant];
    expect(seed.users).toHaveLength(267);
    expect(seed.users.filter((u) => u.userType === "Employee")).toHaveLength(
      238,
    );
    expect(seed.users.filter((u) => u.userType === "Contractor")).toHaveLength(
      29,
    );
    expect(seed.users.filter((u) => !u.manager)).toHaveLength(1);
    expect(seed.organizations).toHaveLength(9);
    const byId = new Map(seed.users.map((u) => [u.id, u]));
    expect(byId.size).toBe(seed.users.length);
    expect(new Set(seed.users.map((u) => u.userName.toLowerCase())).size).toBe(
      267,
    );
    for (const user of seed.users) {
      expect(seeds.realestate.users.some((u) => u.id === user.id)).toBe(false);
      const seen = new Set<string>();
      let current: typeof user | undefined = user;
      while (current) {
        expect(seen.has(current.id)).toBe(false);
        seen.add(current.id);
        if (current.manager) expect(byId.has(current.manager)).toBe(true);
        current = current.manager ? byId.get(current.manager) : undefined;
      }
      if (user.userType === "Contractor")
        expect(byId.get(user.manager!)?.userType).toBe("Employee");
    }
    for (const org of seed.organizations) {
      expect(
        seed.users.filter(
          (u) => u.organization === org.name && u.userType === "Employee",
        ),
      ).toHaveLength(org.employees);
      expect(
        seed.users.filter(
          (u) => u.organization === org.name && u.userType === "Contractor",
        ),
      ).toHaveLength(org.vendors);
    }
    expect(seed.groups.length).toBeGreaterThan(150);
    expect(new Set(seed.groups.map((g) => g.id)).size).toBe(seed.groups.length);
    expect(new Set(seed.groups.map((g) => g.displayName)).size).toBe(
      seed.groups.length,
    );
    for (const group of seed.groups)
      for (const member of group.members)
        expect(byId.has(member.value)).toBe(true);
    for (const admin of seed.groups.filter((g) =>
      g.displayName.endsWith("-ADMINS"),
    ))
      for (const member of admin.members)
        expect(byId.get(member.value)?.userType).toBe("Employee");
  });
  it(`${tenant} login brand follows the employee domain and archetype styling`, () => {
    const s = initial(tenant);
    applyAccountDomains(s, {
      employee: "limekube.com",
      contractor: "vendors.example",
    });
    expect(loginBrand(tenant, s).header).toContain("LIMEKUBE");
    expect(loginBrand(tenant, s).header).toContain(archetypes[tenant].name);
    expect(loginBrand(tenant, s).header).not.toContain("AuthNAuthZ");
  });
}
it("isolates tenant state, memberships, configuration and protocol grants", async () => {
  const store = new Store(new MemoryBackend());
  await store.mutate("biotech", (s) => {
    s.resources.Users[0].active = false;
    s.models["Grant:example"] = {
      payload: { accountId: s.resources.Users[0].id },
      expires: Date.now() + 60000,
    };
  });
  expect((await store.read("biotech")).resources.Users[0].active).toBe(false);
  for (const t of ["insurance", "realestate"]) {
    const s = await store.read(t);
    expect(s.resources.Users[0].active).toBe(true);
    expect(s.models["Grant:example"]).toBeUndefined();
  }
  expect(() => tenantId("constructor")).toThrow();
  expect(() => tenantId("unknown")).toThrow();
});
