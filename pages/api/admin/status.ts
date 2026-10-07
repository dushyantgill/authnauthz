import { tenantId } from "../../../lib/config";
import type { NextApiRequest, NextApiResponse } from "next";
import { admin, headers } from "../../../lib/security";
import { deploymentStatus } from "../../../lib/deployment";
import { store } from "../../../lib/store";
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
    if (req.method !== "GET")
      return res.status(405).json({ error: "Method not allowed" });
    return res.json(
      deploymentStatus(!!(await store().read(tenant)).sharedCredential),
    );
  } catch {
    return res.status(503).json({ error: "Deployment status unavailable" });
  }
}
