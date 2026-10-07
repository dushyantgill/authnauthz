import { it, expect } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";
import { store } from "../lib/store";
import { passwordOK } from "../lib/security";
it("uses the runtime shared password for active accounts instead of the deployment fallback", async () => {
  const s = store();
  const state = await s.read("realestate");
  const id = state.resources.Users[0].id;
  const salt = randomBytes(16).toString("hex");
  await s.mutate("realestate", (state) => {
    state.sharedCredential = {
      salt,
      hash: scryptSync("Test@User1", salt, 32).toString("hex"),
    };
  });
  expect(await passwordOK("realestate", id, "Test@User1")).toBe(true);
  expect(await passwordOK("realestate", id, "incorrect")).toBe(false);
  await s.mutate("realestate", (state) => {
    state.resources.Users[0].active = false;
  });
  expect(await passwordOK("realestate", id, "Test@User1")).toBe(false);
});
