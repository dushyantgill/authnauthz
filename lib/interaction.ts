import type { NextApiRequest, NextApiResponse } from "next";
import { provider } from "./oidc";
import { body } from "./http";
import { origin } from "./config";
import {
  csrf,
  verifyCsrf,
  passwordOK,
  setSession,
  escape,
  sameOrigin,
  loginLimit,
} from "./security";
import { store } from "./store";
export async function interaction(
  t: string,
  uid: string,
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const p = await provider(t);
  const details = await p.interactionDetails(req, res);
  if (details.uid !== uid) return res.status(400).end();
  const { prompt, params, session } = details;
  if (req.method === "GET") {
    const token = await csrf(t, uid);
    const users = (await store().read(t)).resources.Users.filter(
      (u) => u.active,
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    );
    return res
      .status(200)
      .send(
        `<!doctype html><html><head><title>Summit Ridge sign in</title><style>body{font:16px system-ui;background:#f2f5f4;margin:6% auto;max-width:540px}main{background:white;padding:36px;border-radius:16px}input,select,button{display:block;box-sizing:border-box;width:100%;padding:12px;margin:14px 0}button{background:#174d3d;color:white;border:0}</style></head><body><main><h1>${prompt.name === "login" ? "Sign in" : "Approve access"}</h1><p>Summit Ridge Properties · Identity simulator</p><p>Application: ${escape(params.client_id)}</p><p>Requested scopes: ${escape(params.scope)}</p><form method="post" action="${escape(origin())}/api/t/${t}/interaction/${escape(uid)}"><input type="hidden" name="csrf" value="${token}">${prompt.name === "login" ? `<label>Simulation identity<select name="accountId">${users.map((u) => `<option value="${u.id}">${escape(u.displayName)} — ${escape(u.title)}</option>`).join("")}</select></label><label>Simulation password<input name="password" type="password" required autocomplete="current-password"></label>` : ""}<button name="action" value="approve">${prompt.name === "login" ? "Sign in" : "Approve"}</button><button name="action" value="deny">Cancel</button></form></main></body></html>`,
      );
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!sameOrigin(req))
    return res.status(403).json({ error: "invalid_origin" });
  const b = await body(req);
  await verifyCsrf(t, String(b.csrf), uid);
  if (b.action === "deny")
    return p.interactionFinished(
      req,
      res,
      { error: "access_denied", error_description: "User declined" },
      { mergeWithLastSubmission: false },
    );
  if (prompt.name === "login") {
    await loginLimit(
      t,
      String(req.headers["x-forwarded-for"] || req.socket.remoteAddress),
    );
    if (!(await passwordOK(t, b.accountId, b.password)))
      return res
        .status(401)
        .send("Invalid credentials. Return to the sign-in form and retry.");
    await setSession(res, b.accountId);
    await store().audit(t, "login", b.accountId);
    return p.interactionFinished(
      req,
      res,
      { login: { accountId: b.accountId, ts: Math.floor(Date.now() / 1000) } },
      { mergeWithLastSubmission: false },
    );
  }
  if (prompt.name === "consent") {
    if (!session) return res.status(400).end();
    let grant = details.grantId
      ? await p.Grant.find(details.grantId)
      : undefined;
    if (!grant)
      grant = new p.Grant({
        accountId: session.accountId,
        clientId: String(params.client_id),
      });
    const d = prompt.details as {
      missingOIDCScope?: string[];
      missingOIDCClaims?: string[];
      missingResourceScopes?: Record<string, string[]>;
    };
    if (d.missingOIDCScope) grant.addOIDCScope(d.missingOIDCScope.join(" "));
    if (d.missingOIDCClaims) grant.addOIDCClaims(d.missingOIDCClaims);
    for (const [a, s] of Object.entries(d.missingResourceScopes || {}))
      grant.addResourceScope(a, s.join(" "));
    const grantId = await grant.save();
    return p.interactionFinished(
      req,
      res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true },
    );
  }
  return res.status(400).json({ error: "unsupported_prompt" });
}
