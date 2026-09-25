// Public media links (section 13): /media/<long random token>. Buffer fetches the clip
// through this; the token is cleared 30 days after posting, so the link dies with it.
// Range requests are honoured so players can seek.
import { Hono } from "hono";
import type { Env, Vars } from "../env";

export const media = new Hono<{ Bindings: Env; Variables: Vars }>();

media.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[a-z0-9]{30,64}$/.test(token)) return c.text("Not found", 404);
  const kind = c.req.query("cover") === "1" ? "cover" : "clip";
  const row = await c.env.DB.prepare("SELECT r2_key, cover_r2_key FROM clips WHERE media_token = ? AND status != 'deleted'").bind(token).first<{ r2_key: string; cover_r2_key: string | null }>();
  if (!row) return c.text("Not found", 404);
  const key = kind === "cover" ? row.cover_r2_key : row.r2_key;
  if (!key) return c.text("Not found", 404);
  const range = c.req.header("range");
  const obj = await c.env.FILES.get(key, range ? { range: c.req.raw.headers } : undefined);
  if (!obj) return c.text("Not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  if (!headers.get("content-type")) headers.set("content-type", kind === "cover" ? "image/jpeg" : "video/mp4");
  if (range && obj.range && "offset" in obj.range) {
    const start = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
});
