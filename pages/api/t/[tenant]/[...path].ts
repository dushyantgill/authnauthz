import type { NextApiRequest, NextApiResponse } from "next";
import { provider } from "../../../../lib/oidc";
import { tenantId, issuer, origin } from "../../../../lib/config";
import { headers } from "../../../../lib/security";
import { interaction } from "../../../../lib/interaction";
import { scim } from "../../../../lib/scim";
import { federation } from "../../../../lib/federation";
export const config = { api: { bodyParser: false, responseLimit: "4mb" } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  headers(res);
  try {
    const t = tenantId(String(req.query.tenant)),
      paths = req.query.path as string[];
    if (paths[0] === "oidc") {
      (req as NextApiRequest & { originalUrl?: string }).originalUrl = req.url;
      req.url = req.url!.replace(`/api/t/${t}/oidc`, "") || "/";
      req.headers.host = new URL(origin()).host;
      req.headers["x-forwarded-proto"] = new URL(origin()).protocol.slice(
        0,
        -1,
      );
      req.headers["x-forwarded-host"] = new URL(origin()).host;
      await (await provider(t)).callback()(req, res);
      return;
    }
    if (paths[0] === "interaction")
      return await interaction(t, paths[1], req, res);
    if (paths[0] === "scim") return await scim(t, paths.slice(1), req, res);
    if (paths[0] === "saml" || paths[0] === "wsfed")
      return await federation(t, paths, req, res);
    res.status(404).json({ error: "not_found", issuer: issuer(t) });
  } catch (e) {
    console.error("Request failed", e instanceof Error ? e.message : "unknown");
    if (!res.headersSent)
      res.status(503).json({
        error: "temporarily_unavailable",
        error_description:
          "Request could not be completed. Check server configuration or retry.",
      });
  }
}
