import type { State } from "./store";
import { AccountDomainsSchema } from "./config";
export function applyAccountDomains(s: State, input: unknown) {
  const domains = AccountDomainsSchema.parse(input);
  const changes = s.resources.Users.filter(
    (u) => u.userType === "Employee" || u.userType === "Contractor",
  ).map((u) => {
    const suffix =
      u.userType === "Employee" ? domains.employee : domains.contractor;
    const local = u.userName.slice(0, u.userName.lastIndexOf("@"));
    if (!local) throw Error("An account has no valid username prefix");
    return { u, name: `${local}@${suffix}` };
  });
  const names = new Set<string>();
  const proposed = new Map(changes.map((c) => [c.u.id, c.name]));
  for (const u of s.resources.Users) {
    const name = (proposed.get(u.id) || u.userName).toLowerCase();
    if (names.has(name))
      throw Error(
        "These domains would create duplicate usernames. Choose different domains or resolve conflicting usernames first.",
      );
    names.add(name);
  }
  for (const { u, name } of changes) {
    if (u.userName === name) continue;
    u.userName = name;
    const emails = u.emails || [];
    const work = emails.filter((e: any) => e.type === "work");
    if (work.length) for (const e of work) e.value = name;
    else
      emails.push({
        value: name,
        type: "work",
        primary: !emails.some((e: any) => e.primary),
      });
    u.emails = emails;
    u.meta = {
      ...u.meta,
      lastModified: new Date().toISOString(),
      version: `W/"${s.version + 1}"`,
    };
  }
  s.config.accountDomains = domains;
}
