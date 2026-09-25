// Public, unauthenticated API: the media kit page (section 12b.1) and the help-guide feedback
// "Report a problem". Nothing else is public.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { publicMediaKit } from "./mediakit";

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

publicRoutes.get("/kit/:slug", async (c) => {
  const kit = await publicMediaKit(c.env, c.req.param("slug"));
  if (!kit) return c.json({ error: "No media kit at this address." }, 404);
  c.header("cache-control", "public, max-age=300");
  return c.json(kit);
});
