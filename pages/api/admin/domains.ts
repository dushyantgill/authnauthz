import type { NextApiRequest, NextApiResponse } from "next";
import { store } from "../../../lib/store";
import { admin, headers, sameOrigin } from "../../../lib/security";
import { AccountDomainsSchema } from "../../../lib/config";
import { applyAccountDomains } from "../../../lib/domains";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  try {
    if (!admin(req)) return res.status(401).json({ error: "unauthorized" });
    if (req.method !== "PUT")
      return res.status(405).json({ error: "Method not allowed" });
    if (req.headers.origin && !sameOrigin(req))
      return res.status(403).json({ error: "Invalid origin" });
    const parsed = AccountDomainsSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Enter valid domain suffixes without @ or a URL." });
    await store().mutate("realestate", (s) => {
      applyAccountDomains(s, parsed.data);
      s.events.unshift({
        at: new Date().toISOString(),
        type: "account_domains.updated",
      });
      s.events = s.events.slice(0, 100);
    });
    return res.json({ ok: true });
  } catch (e) {
    return res
      .status(400)
      .json({
        error: e instanceof Error ? e.message : "Unable to save domains",
      });
  }
}
