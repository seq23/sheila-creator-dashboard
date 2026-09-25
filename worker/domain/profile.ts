// Brand Profile (BUILD_PLAN.md section 5): the nine fixed sections, the drafting prompt, the
// parser for the model's answer, and the stand-in profile used with fake services.
import { BRAND_PROFILE_SECTIONS, type BrandProfileKey } from "@shared/constants";
import type { BrandProfileSections } from "@shared/types";

export const PROFILE_KEYS = BRAND_PROFILE_SECTIONS.map((s) => s.key) as BrandProfileKey[];

/** Drafting in the Worker is one model call; past this much text the job drafts instead. */
export const WORKER_DRAFT_MAX_CHARS = 60_000;
export const SECTION_MAX_CHARS = 4_000;

export function emptySections(): BrandProfileSections {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, ""])) as BrandProfileSections;
}

/** Keep only the nine keys, as trimmed strings of bounded length. */
export function cleanSections(x: unknown): BrandProfileSections {
  const out = emptySections();
  if (!x || typeof x !== "object") return out;
  const o = x as Record<string, unknown>;
  for (const k of PROFILE_KEYS) {
    const v = o[k];
    const s = Array.isArray(v) ? v.map((i) => `• ${String(i)}`).join("\n") : typeof v === "string" ? v : v == null ? "" : String(v);
    out[k] = s.trim().slice(0, SECTION_MAX_CHARS);
  }
  return out;
}

export function filledCount(s: BrandProfileSections): number {
  return PROFILE_KEYS.filter((k) => s[k].trim().length > 0).length;
}

/** Parse the model's JSON answer; tolerates a fenced code block around it. */
export function parseProfileAnswer(text: string): BrandProfileSections | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const s = cleanSections(JSON.parse(m[0]));
    return filledCount(s) >= 5 ? s : null;
  } catch {
    return null;
  }
}

export const PROFILE_SYSTEM = `You distill a creator's brand documents into one Brand Profile that every later AI step reads.
Answer with ONE JSON object and nothing else. Keys (all strings, plain words, short paragraphs or "• " bullet lines):
${BRAND_PROFILE_SECTIONS.map((s) => `  "${s.key}": ${s.label}`).join("\n")}
Rules: use only what the documents say or clearly imply; never invent numbers, names or partners.
If the documents say nothing about a section, write "Not in your docs yet." for it.
"themes" lists 3 to 5 themes. "do_dont" has "Do:" and "Don't:" lines. "off_limits" is what she never posts about.`;

export function profileUserPrompt(docs: { n: number; text: string }[]): string {
  return docs.map((d) => `--- Document ${d.n} ---\n${d.text}`).join("\n\n");
}

/**
 * Stand-in profile for FAKE_SERVICES=1: a realistic draft for Sheila Bruce, built from the
 * public facts on her site (seq23/sheila-bruce: about page and site.json). Demo data only.
 */
export const FAKE_PROFILE: BrandProfileSections = {
  who: "Sheila Bruce is the host behind A Sheila Bruce Affair, a luxury lifestyle and event brand on Florida's Gulf Coast. She is a Black woman over 50 who started by bringing women together through Sisters of Sarasota and grew it into a brand for social gatherings, wellness conversations, empowerment experiences and unforgettable celebrations.",
  audience: "• Black women and their friends who want to gather with intention\n• Couples, accomplished professionals and community leaders who still love to show up well\n• Retirees and Gulf Coast neighbors in Sarasota, Venice, Palmetto and nearby\n• Mostly 40+, style-minded, into culture, wellness and elevated living",
  goals: "90 days: post consistently on TikTok, Instagram and YouTube Shorts; grow followers who come to the next affair; fill every event.\n1 year: be the go-to name for luxury social events on the Gulf Coast; land 3–5 paid brand partnerships that fit the brand (hospitality, beauty, wellness, fashion, travel).",
  voice: "Warm, gracious and polished, with joy in it. Speaks like a host welcoming you in: \"Come gather with us.\" Confident, never loud; celebratory, never flashy for its own sake. Sisterly and encouraging.",
  themes: "• Signature boat and yacht experiences: white parties, champagne moments, DJ-led afternoons by the water\n• Formal balls and galas: black-tie glamour, dinner and dancing\n• Wellness and empowerment: health, wealth, leadership and confidence conversations for women\n• Dinners, cocktail gatherings and seasonal socials on the Gulf Coast\n• Behind the scenes of hosting: planning, styling, the setting",
  do_dont: "Do: show real guests having a beautiful time (with their OK); show the Gulf Coast setting; lead with the feeling of the room; credit venues and partners.\nDon't: post guests who did not agree to be filmed; use slang that doesn't sound like her; make it look cheap or rushed.",
  off_limits: "Politics, religion debates, gossip about guests or other hosts, guests' private details, anything that embarrasses a guest.",
  deal_fit: "Hospitality and venues (marinas, yacht charters, resorts, restaurants), champagne and wine, fashion and formalwear, beauty and hair care for Black women, wellness brands for women over 40, travel along the Gulf Coast. Not a fit: fast food, gambling, anything off-brand for a luxury host.",
  ctas: "• \"Come to the next affair: link in bio.\"\n• \"Follow for the next date.\"\n• \"Have Sheila host your event.\"\n• \"Tag the friend you're bringing.\"",
};
