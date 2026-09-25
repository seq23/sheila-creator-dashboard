// Media kit (section 12b.1). OWNED BY: phase 10. Base stub exposes the public reader.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import type { MediaKitPublic } from "@shared/types";

export const mediakit = new Hono<{ Bindings: Env; Variables: Vars }>();
mediakit.use("*", requireUser);

mediakit.get("/", async (c) => c.json(await publicMediaKit(c.env, "sheila")));

export async function publicMediaKit(env: Env, slug: string): Promise<MediaKitPublic | null> {
  const kit = await env.DB.prepare("SELECT bio, public_slug, contact_email, past_partners, rates FROM media_kit WHERE id = 1").first<{
    bio: string;
    public_slug: string;
    contact_email: string | null;
    past_partners: string;
    rates: string | null;
  }>();
  if (!kit || kit.public_slug !== slug) return null;
  return {
    name: "Sheila Bruce",
    bio: kit.bio,
    photo_url: null,
    themes: [],
    audience: "",
    platforms: [],
    featured: [],
    past_partners: JSON.parse(kit.past_partners || "[]"),
    rates: kit.rates ? JSON.parse(kit.rates) : null,
    contact_email: kit.contact_email,
  };
}
