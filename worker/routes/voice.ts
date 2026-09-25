// Voice narration (section 12), hidden until switched on. OWNED BY: phase 11. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const voice = new Hono<{ Bindings: Env; Variables: Vars }>();
voice.use("*", requireUser);

voice.get("/", async (c) => c.json({ enabled: false, hasSample: false, narrations: [] }));
