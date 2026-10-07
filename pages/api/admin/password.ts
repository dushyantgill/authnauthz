import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes, scryptSync } from "node:crypto";
import { admin, headers, sameOrigin } from "../../../lib/security";
import { store } from "../../../lib/store";
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
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: "Use a test password of 10–128 characters." });
    const salt = randomBytes(16).toString("hex"),
      hash = scryptSync(password, salt, 32).toString("hex");
    await store().mutate("realestate", (s) => {
      s.sharedCredential = { salt, hash };
      // Changing a shared login credential invalidates every existing protocol grant/session.
      s.models = {};
      s.events.unshift({
        at: new Date().toISOString(),
        type: "simulation_password.updated",
      });
      s.events = s.events.slice(0, 100);
    });
    return res.json({ ok: true });
  } catch (e) {
    return res
      .status(400)
      .json({
        error: e instanceof Error ? e.message : "Unable to save password",
      });
  }
}
