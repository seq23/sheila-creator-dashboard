// Brand deals (section 12b). OWNED BY: phase 10. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const deals = new Hono<{ Bindings: Env; Variables: Vars }>();
deals.use("*", requireUser);

deals.get("/", async (c) => c.json({ brands: [] }));
