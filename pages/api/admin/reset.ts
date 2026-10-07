import type { NextApiRequest, NextApiResponse } from "next";
import { store, initial } from "../../../lib/store";
import { admin, headers, sameOrigin } from "../../../lib/security";
import { applyAccountDomains } from "../../../lib/domains";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  if (!admin(req)) return res.status(401).end();
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers.origin && !sameOrigin(req)) return res.status(403).end();
  if (req.body?.confirm !== "RESET SUMMIT RIDGE")
    return res.status(400).json({ error: "Confirmation text required" });
  await store().mutate("realestate", (s) => {
    s.resources = initial().resources;
    if (s.config.accountDomains)
      applyAccountDomains(s, s.config.accountDomains);
    s.models = {};
    s.events = [{ at: new Date().toISOString(), type: "directory.reset" }];
  });
  res.json({ ok: true });
}
