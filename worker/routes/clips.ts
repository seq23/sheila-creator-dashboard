// Review (section 9). OWNED BY: phase 5 (Review). Base stub: list only.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const clips = new Hono<{ Bindings: Env; Variables: Vars }>();
clips.use("*", requireUser);

clips.get("/", async (c) => c.json([]));
