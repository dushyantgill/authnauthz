import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { origin, required } from "./config";
import { store } from "./store";
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function admin(req: NextApiRequest) {
  const b = req.headers.authorization || "";
  return equal(b, `Bearer ${required("ADMIN_TOKEN")}`);
}
export function scimAuth(req: NextApiRequest) {
  return equal(
    req.headers.authorization || "",
    `Bearer ${required("SCIM_TOKEN")}`,
  );
}
export function headers(res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
export function sameOrigin(req: NextApiRequest) {
  return req.headers.origin === origin();
}
export function escape(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function mac(v: string) {
  return createHmac("sha256", required("COOKIE_SECRET"))
    .update(v)
    .digest("base64url");
}
export function cookieUser(req: NextApiRequest) {
  const raw = req.cookies["authnauthz_session"];
  if (!raw) return null;
  const [b, sig] = raw.split(".");
  if (!sig || !equal(mac(b), sig)) return null;
  try {
    const v = JSON.parse(Buffer.from(b, "base64url").toString());
    if (v.exp < Date.now() || v.tenant !== "realestate") return null;
    return v as {
      id: string;
      tenant: string;
      exp: number;
      authTime: number;
      sid: string;
    };
  } catch {
    return null;
  }
}
export async function currentSession(req: NextApiRequest) {
  const session = cookieUser(req);
  if (!session) return null;
  const state = await store().read(session.tenant);
  const entry = state.models["BrowserSession:" + session.sid];
  return entry &&
    entry.expires > Date.now() &&
    state.resources.Users.some((u) => u.id === session.id && u.active)
    ? session
    : null;
}
export async function revokeSessions(t: string, id: string) {
  await store().mutate(t, (s) => {
    for (const [k, e] of Object.entries(s.models))
      if (e.payload.accountId === id || e.payload.id === id) delete s.models[k];
  });
}
export async function setSession(res: NextApiResponse, id: string) {
  const sid = randomBytes(24).toString("hex");
  await store().mutate("realestate", (s) => {
    s.models["BrowserSession:" + sid] = {
      payload: { accountId: id },
      expires: Date.now() + 3600000,
    };
  });
  const b = Buffer.from(
    JSON.stringify({
      id,
      sid,
      tenant: "realestate",
      exp: Date.now() + 3600000,
      authTime: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  res.setHeader(
    "Set-Cookie",
    `authnauthz_session=${b}.${mac(b)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${origin().startsWith("https:") ? "; Secure" : ""}`,
  );
}
export function clearSession(res: NextApiResponse) {
  res.setHeader(
    "Set-Cookie",
    `authnauthz_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${origin().startsWith("https:") ? "; Secure" : ""}`,
  );
}
export async function csrf(t: string, purpose: string) {
  const token = randomBytes(32).toString("hex");
  await store().mutate(t, (s) => {
    s.models["CSRF:" + token] = {
      payload: { purpose },
      expires: Date.now() + 300000,
    };
  });
  return token;
}
export async function verifyCsrf(t: string, token: string, purpose: string) {
  await store().mutate(t, (s) => {
    const k = "CSRF:" + token;
    const v = s.models[k];
    if (!v || v.payload.purpose !== purpose)
      throw Error("Expired or invalid form");
    delete s.models[k];
  });
}
export async function passwordOK(t: string, id: string, password: string) {
  const state = await store().read(t);
  if (!state.resources.Users.some((u) => u.id === id && u.active)) return false;
  const record = JSON.parse(required("SIMULATION_PASSWORD_HASH"));
  const hash = scryptSync(password, record.salt, 32).toString("hex");
  return equal(hash, record.hash);
}
export async function loginLimit(t: string, ip: string) {
  const id =
    "Rate:" +
    createHmac("sha256", required("COOKIE_SECRET")).update(ip).digest("hex");
  await store().mutate(t, (s) => {
    const e = s.models[id];
    const n = (e?.payload.count || 0) + 1;
    if (n > 15) throw Error("Too many login attempts; retry later");
    s.models[id] = {
      payload: { count: n },
      expires: e?.expires || Date.now() + 60000,
    };
  });
}
