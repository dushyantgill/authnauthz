import { tenantId } from "../../../lib/config";
import type { NextApiRequest, NextApiResponse } from "next";
import { store } from "../../../lib/store";
import { admin, headers } from "../../../lib/security";
import { seeds } from "../../../lib/archetypes";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  let tenant: string;
  try {
    tenant = tenantId(String(req.query.tenant || "realestate"));
  } catch {
    return res.status(404).json({ error: "Unknown archetype" });
  }
  try {
    if (!admin(req)) return res.status(401).json({ error: "unauthorized" });
    if (req.method !== "GET") return res.status(405).end();
    const s = await store().read(tenant);
    res.json({
      users: s.resources.Users.map((u) => ({
        ...u,
        displayName: u.displayName || u.userName,
      })),
      groups: s.resources.Groups,
      events: s.events,
      organizations: seeds[tenantId(tenant)].organizations,
      version: s.version,
    });
  } catch (e) {
    console.error("Admin directory request failed", e);
    return res.status(503).json({
      error:
        e instanceof Error ? e.message : "Directory temporarily unavailable",
    });
  }
}
