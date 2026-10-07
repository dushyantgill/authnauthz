import type { NextApiRequest } from "next";
export async function body(req: NextApiRequest) {
  let n = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    n += c.length;
    if (n > 262144) throw Error("Request body too large");
    chunks.push(Buffer.from(c));
  }
  const s = Buffer.concat(chunks).toString();
  if ((req.headers["content-type"] || "").includes("json"))
    return JSON.parse(s || "{}");
  const params = new URLSearchParams(s);
  for (const key of params.keys())
    if (params.getAll(key).length > 1) throw Error("Duplicate form parameter");
  return Object.fromEntries(params);
}
