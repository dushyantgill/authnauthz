import { it, expect } from "vitest";
import { initial } from "../lib/store";
import { applyAccountDomains } from "../lib/domains";
import { DomainSchema } from "../lib/config";
it("changes both populations without changing IDs, hierarchy or memberships", () => {
  const s = initial();
  const before = s.resources.Users.map((u) => ({
    id: u.id,
    enterprise: u["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"],
  }));
  const groups = structuredClone(s.resources.Groups);
  applyAccountDomains(s, {
    employee: "Staff.Example.com",
    contractor: "partners.example.com",
  });
  expect(
    s.resources.Users.filter((u) => u.userName.endsWith("@staff.example.com")),
  ).toHaveLength(238);
  expect(
    s.resources.Users.filter((u) =>
      u.userName.endsWith("@partners.example.com"),
    ),
  ).toHaveLength(29);
  expect(
    s.resources.Users.map((u) => ({
      id: u.id,
      enterprise:
        u["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"],
    })),
  ).toEqual(before);
  expect(s.resources.Groups).toEqual(groups);
  for (const u of s.resources.Users)
    expect(u.emails.find((e: any) => e.type === "work").value).toBe(u.userName);
  applyAccountDomains(s, {
    employee: "next.example.com",
    contractor: "vendors.example.com",
  });
  expect(
    s.resources.Users.every((u) => !u.userName.includes("staff.example.com")),
  ).toBe(true);
});
it("rejects invalid domains and collisions without partially changing accounts", () => {
  for (const d of [
    "@example.com",
    "https://example.com",
    "a..com",
    "-a.com",
    "a b.com",
  ])
    expect(DomainSchema.safeParse(d).success).toBe(false);
  const s = initial();
  s.resources.Users[0].userName = "same@one.example";
  s.resources.Users[1].userName = "same@two.example";
  const before = structuredClone(s);
  expect(() =>
    applyAccountDomains(s, {
      employee: "example.com",
      contractor: "example.com",
    }),
  ).toThrow("duplicate");
  expect(s).toEqual(before);
});
