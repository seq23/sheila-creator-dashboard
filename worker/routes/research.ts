// Research Brief (section 6). OWNED BY: phase 3. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const research = new Hono<{ Bindings: Env; Variables: Vars }>();
research.use("*", requireUser);

research.get("/", async (c) => c.json({ brief: null, uploads: [] }));
