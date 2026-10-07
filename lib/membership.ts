import type { Resource } from "./store";
export function memberships(groups: Resource[], userId: string) {
  const memberIds = new Set([userId]),
    result: Resource[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups)
      if (
        !memberIds.has(g.id) &&
        g.members?.some((m: Resource) => memberIds.has(m.value))
      ) {
        memberIds.add(g.id);
        result.push(g);
        changed = true;
      }
  }
  return result;
}
