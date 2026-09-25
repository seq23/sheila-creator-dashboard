// Help center (section 12c). Guides are Markdown in help/guides, bundled into the client;
// the API only stores "Did this work?" feedback. OWNED BY: help phase. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { readJson } from "../lib/http";
import { newId } from "../lib/ids";

export const help = new Hono<{ Bindings: Env; Variables: Vars }>();
help.use("*", requireUser);

help.post("/feedback", async (c) => {
  const body = await readJson<{ slug?: string; worked?: boolean; note?: string }>(c);
  if (!body?.slug || typeof body.worked !== "boolean") return c.json({ error: "Missing guide." }, 400);
  await c.env.DB.prepare("INSERT INTO help_feedback (id, guide_slug, worked, note) VALUES (?, ?, ?, ?)")
    .bind(newId("hf"), body.slug.slice(0, 80), body.worked ? 1 : 0, (body.note ?? "").slice(0, 1000))
    .run();
  return c.json({ ok: true });
});
