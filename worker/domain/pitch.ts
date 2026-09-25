// Pitch drafts (section 12b.4): subject, a short email that names one of their products, her
// audience fit in numbers, 1–2 clip links, the media-kit link and one clear ask; a short DM;
// two follow-ups (day 5, day 12). The model writes these from her locked Brand Profile; this
// file holds the prompt, the parser that refuses a half answer, and the plain starter draft
// used by the fake model and whenever the free model is busy.

export interface PitchInput {
  creatorName: string;
  voice: string;
  audience: string;
  themes: string[];
  dealFit: string;
  brand: { name: string; website: string | null; why_now: string | null; fit_reasons: string[]; product: string | null; herPick: boolean };
  numbers: { platform: string; followers: number; avg_views: number }[];
  clipLinks: string[];
  mediaKitUrl: string;
  contactKind: "form" | "role_email" | "agency" | null;
}

export interface PitchDraft {
  subject: string;
  body: string;
  dm_text: string;
  followup_1: string;
  followup_2: string;
}

const PLATFORM_NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

export function numbersLine(numbers: PitchInput["numbers"]): string {
  const parts = numbers
    .filter((n) => n.followers > 0)
    .map((n) => `${compact(n.followers)} followers on ${PLATFORM_NAME[n.platform] ?? n.platform} (about ${compact(n.avg_views)} views a video)`);
  return parts.length ? parts.join(", ") : "";
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function pitchPrompt(p: PitchInput): { system: string; user: string } {
  const system = [
    `You write brand partnership pitches for the creator ${p.creatorName}, in her voice.`,
    `Her voice and tone: ${p.voice || "warm, direct, confident"}.`,
    "Rules: short sentences; no hype words; name one real product of theirs only if the brand notes give one, otherwise say 'your line'; include her numbers exactly as given; include every clip link and the media-kit link exactly as given; one clear ask; sign with her first name.",
    "Answer as JSON with keys subject, body, dm_text, followup_1, followup_2. body under 140 words; dm_text under 60 words; each follow-up under 60 words; followup_1 is sent on day 5, followup_2 on day 12.",
  ].join("\n");
  const user = JSON.stringify({
    brand: p.brand,
    her_audience: p.audience,
    her_themes: p.themes,
    brand_deal_fit: p.dealFit,
    her_numbers: numbersLine(p.numbers),
    clip_links: p.clipLinks,
    media_kit: p.mediaKitUrl,
    contact_route: p.contactKind,
  });
  return { system, user };
}

/** Parse the model's JSON; null unless every field is a non-empty string and the links survived. */
export function parsePitch(text: string, p: PitchInput): PitchDraft | null {
  let raw: unknown;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    raw = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const keys = ["subject", "body", "dm_text", "followup_1", "followup_2"] as const;
  if (!keys.every((k) => typeof r[k] === "string" && (r[k] as string).trim().length > 0)) return null;
  const draft = Object.fromEntries(keys.map((k) => [k, (r[k] as string).trim()])) as unknown as PitchDraft;
  // The kit link is the one thing a pitch must carry; add it if the model dropped it.
  if (!draft.body.includes(p.mediaKitUrl)) draft.body = `${draft.body}\n\nMedia kit: ${p.mediaKitUrl}`;
  for (const link of p.clipLinks) if (!draft.body.includes(link)) draft.body = `${draft.body}\n${link}`;
  draft.subject = draft.subject.slice(0, 140);
  return draft;
}

/** The plain starter draft: realistic copy from her profile, no model needed. */
export function starterPitch(p: PitchInput): PitchDraft {
  const first = p.creatorName.split(" ")[0] || p.creatorName;
  const product = p.brand.product ? `your ${p.brand.product}` : "your line";
  const theme = p.themes[0] ?? "everyday style";
  const nums = numbersLine(p.numbers);
  const clips = p.clipLinks.length ? `${p.clipLinks.length === 1 ? "A clip that shows" : "Two clips that show"} my style:\n${p.clipLinks.join("\n")}` : "";
  const top = [...p.numbers].sort((a, b) => b.followers - a.followers)[0];
  const dmNums = top && top.followers > 0 ? ` (${compact(top.followers)} followers on ${PLATFORM_NAME[top.platform] ?? top.platform})` : "";
  const opener = p.brand.herPick
    ? `I'm ${first}, and I already use ${product} in my ${theme.toLowerCase()} videos. My audience keeps asking about it.`
    : `I'm ${first}, and I make ${theme.toLowerCase()} videos that fit ${product} naturally.`;
  const body = [
    `Hi ${p.brand.name} team,`,
    "",
    opener,
    nums ? `My audience: ${p.audience ? `${p.audience.replace(/\.$/, "")}; ` : ""}${nums}.` : p.audience ? `My audience: ${p.audience.replace(/\.$/, "")}.` : "",
    clips,
    `Media kit: ${p.mediaKitUrl}`,
    "",
    `Would you be open to a paid partnership this season — one video on TikTok and Instagram featuring ${product}? Happy to send ideas.`,
    "",
    first,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return {
    subject: `Creator partnership idea: ${p.brand.name} × ${first}`,
    body,
    dm_text: `Hi ${p.brand.name}! I'm ${first}${dmNums}. I make ${theme.toLowerCase()} videos and I'd love to feature ${product} in a paid partnership. My media kit: ${p.mediaKitUrl}. Who is the best person to talk to?`,
    followup_1: `Hi ${p.brand.name} team, just floating this back up. I'd love to create a video featuring ${product}; my media kit is here: ${p.mediaKitUrl}. Is there someone better to send this to? ${first}`,
    followup_2: `Hi again, last note from me on this one. If a partnership isn't right for this season, no problem at all. If it is, I'd love to talk. ${p.mediaKitUrl} ${first}`,
  };
}
