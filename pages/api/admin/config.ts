import type { NextApiRequest, NextApiResponse } from "next";
import { ConfigSchema } from "../../../lib/config";
import { store } from "../../../lib/store";
import { admin, headers, sameOrigin } from "../../../lib/security";
import { validateMetadata } from "../../../lib/federation";
import { applyAccountDomains } from "../../../lib/domains";
export const config = { api: { bodyParser: { sizeLimit: "256kb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  try {
    if (!admin(req)) return res.status(401).json({ error: "unauthorized" });
    if (req.method === "GET")
      return res.json((await store().read("realestate")).config);
    if (req.method !== "PUT") return res.status(405).end();
    if (req.headers.origin && !sameOrigin(req)) return res.status(403).end();
    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    for (const app of parsed.data.samlApps) {
      const sp = validateMetadata(app.metadata);
      if (
        app.requireSignedRequests &&
        !sp.entityMeta.getX509Certificate("signing")
      )
        throw Error("SP signing certificate required");
      if (
        app.encryptAssertions &&
        !sp.entityMeta.getX509Certificate("encryption")
      )
        throw Error("SP encryption certificate required");
    }
    await store().mutate("realestate", (s) => {
      applyAccountDomains(
        s,
        req.body.accountDomains ||
          s.config.accountDomains || {
            employee: "summitridge.example",
            contractor: "summitridge.example",
          },
      );
      s.config = { ...parsed.data, accountDomains: s.config.accountDomains };
      s.events.unshift({
        at: new Date().toISOString(),
        type: "configuration.updated",
      });
      s.events = s.events.slice(0, 100);
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({
      error: e instanceof Error ? e.message : "Invalid configuration",
    });
  }
}
