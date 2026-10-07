import type { NextApiRequest, NextApiResponse } from "next";
import { store } from "../../../lib/store";
import { admin, headers } from "../../../lib/security";
import seed from "../../../data/summit-ridge.json";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  try {
    if (!admin(req)) return res.status(401).json({ error: "unauthorized" });
    if (req.method !== "GET") return res.status(405).end();
    const s = await store().read("realestate");
    res.json({
      users: s.resources.Users.map((u) => ({
        ...u,
        displayName: u.displayName || u.userName,
      })),
      groups: s.resources.Groups,
      events: s.events,
      organizations: seed.organizations,
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
