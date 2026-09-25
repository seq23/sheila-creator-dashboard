// Calendar + scheduling (section 10). OWNED BY: phase 6 (Calendar + Buffer). Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const posts = new Hono<{ Bindings: Env; Variables: Vars }>();
posts.use("*", requireUser);

posts.get("/", async (c) => c.json([]));
