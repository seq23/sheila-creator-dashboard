// Stats (section 8 phase, learning loop). OWNED BY: phase 3/8. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const stats = new Hono<{ Bindings: Env; Variables: Vars }>();
stats.use("*", requireUser);

stats.get("/", async (c) => c.json({ topClips: [], bestTimes: [], bestRecipes: [], accounts: [] }));
