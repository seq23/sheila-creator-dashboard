// Client Brain (section 5). OWNED BY: phase 2. Base stub.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";

export const brain = new Hono<{ Bindings: Env; Variables: Vars }>();
brain.use("*", requireUser);

brain.get("/", async (c) => c.json({ docs: [], profile: null, versions: [] }));
