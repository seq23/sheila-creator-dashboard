// Stand-in Research Brief for FAKE_SERVICES=1 (and the unit test that pins its shape).
// Built for Sheila's niche from her locked Brand Profile and the section 10b baseline. It cites
// only real sources: the six 10b studies, her own profile, her stats if connected, and her
// uploads. No web search happens in fake mode, so nothing here pretends to come from one;
// claims without evidence are marked uncertain, exactly as a real brief must.
import { LAUNCH_SLOTS, PLATFORMS, PLATFORM_LABEL, type Platform } from "@shared/constants";
import type { BriefBody, BriefSource, Claim } from "@shared/types";
import { BASELINE_SOURCES } from "../domain/brief";

export interface FakeBriefInput {
  stats: Partial<Record<Platform, { videos: number }>>;
  uploads: { id: string; title: string }[];
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

export function buildFakeBrief(input: FakeBriefInput): { body: BriefBody; sources: BriefSource[] } {
  const sources: BriefSource[] = [...BASELINE_SOURCES, { id: "her_profile", url: null, title: "Your locked Brand Profile", kind: "her_data" }];
  for (const p of PLATFORMS) {
    const s = input.stats[p];
    if (s && s.videos > 0) sources.push({ id: `her_${p}`, url: null, title: `Your ${PLATFORM_LABEL[p]} results (${s.videos} videos)`, kind: "her_data" });
  }
  for (const u of input.uploads) sources.push({ id: `up_${u.id}`, url: null, title: u.title, kind: "upload" });

  const solid = (text: string, source_ids: string[], basis: Claim["basis"]): Claim => ({ text, source_ids, basis, confidence: "solid" });
  const unsure = (text: string, source_ids: string[], basis: Claim["basis"]): Claim => ({ text, source_ids, basis, confidence: "uncertain" });
  const statIds = PLATFORMS.filter((p) => sources.some((s) => s.id === `her_${p}`)).map((p) => `her_${p}`);

  const audience: Claim[] = [
    solid("Her core audience is Black women and their friends, couples and professionals, and Gulf Coast retirees who love to gather well.", ["her_profile"], "her_data"),
    solid("Most of them are 40 and over, style-minded and into wellness, culture and elevated living.", ["her_profile"], "her_data"),
    statIds.length
      ? solid("Her own results show which platform her audience watches most; the Stats page has the numbers.", statIds, "her_data")
      : unsure("Where her followers live and their age split is not known yet. Connect Instagram and YouTube stats, or upload the TikTok export, and the next refresh fills this in.", [], "her_data"),
  ];
  for (const u of input.uploads) audience.push(solid("Her uploaded report is included as a source; its claims are weighed like any other.", [`up_${u.id}`], "upload"));

  const themes = [
    { title: "On the water", claims: [solid("Boat and yacht experiences (white parties, champagne moments, DJ afternoons) are her most visual events and fit short vertical video.", ["her_profile"], "her_data")] },
    { title: "Black-tie nights", claims: [solid("Formal balls and galas: arrivals, gowns and the first dance are natural 15–30 second moments.", ["her_profile"], "her_data")] },
    { title: "Wellness and sisterhood", claims: [solid("Women-centered conversations on health, wealth and confidence give talking-head clips with a clear takeaway.", ["her_profile"], "her_data"), unsure("Talking-head wellness clips may hold attention longer than party montages for her audience; her results will confirm it.", [], "her_data")] },
    { title: "Hosting, behind the scenes", claims: [solid("Planning, styling the table and the venue walk-through show the work behind the affair and build trust with future hosts' clients.", ["her_profile"], "her_data")] },
  ];

  const hooks: Claim[] = [
    solid("\"Come gather with us…\" opening on the best moment of the room: warm and in her voice.", ["her_profile"], "her_data"),
    solid("\"This is what a Sheila Bruce Affair looks like\" over the arrival shot.", ["her_profile"], "her_data"),
    solid("\"Ladies over 50, this one's for you\" to open wellness and confidence clips.", ["her_profile"], "her_data"),
    unsure("A question hook (\"Where are my yacht girls?\") may lift comments; not tested on her account yet.", [], "her_data"),
  ];

  const cut_styles: Claim[] = [
    solid("Hook-first cuts: move the best line or the champagne pop to second 0.", ["her_profile"], "her_data"),
    solid("Tight talking-head, 20–45 seconds, for wellness and empowerment topics.", ["her_profile"], "her_data"),
    unsure("Montage clips of 15–30 seconds for events; the best length for her audience is not known yet and will come from her results.", [], "her_data"),
  ];

  const timeClaim = (p: Platform, day: number, hour: number): Claim => {
    const at = `${DAY[day]} ${hourLabel(hour)}`;
    if (p === "tiktok") {
      if (day === 0 || day === 6) return unsure(`${at}: the big studies disagree on weekends (one says avoid, one ranks Saturday best), so this slot is a test.`, ["b_sprout_tt", "b_buffer_all"], "web");
      return solid(`${at}: weekday late afternoon and evening is where both big TikTok studies overlap.`, ["b_sprout_tt", "b_buffer_all"], "web");
    }
    if (p === "instagram") return solid(`${at}: Instagram evenings and Tuesday–Wednesday are strongest across 9.6M posts; Thursday mornings also do well.`, ["b_buffer_ig", "b_sprout_ig"], "web");
    return solid(`${at}: YouTube Shorts did best Friday around 4 pm, with Saturday close behind.`, ["b_buffer_all"], "web");
  };
  const best_times = {} as BriefBody["best_times"];
  for (const p of PLATFORMS) best_times[p] = LAUNCH_SLOTS[p].map((s) => ({ ...s, claim: timeClaim(p, s.day, s.hour) }));

  const comparable_creators = [
    { handle: "#sarasotaevents", platform: "instagram" as Platform, why: unsure("Local event hosts under this tag show what Gulf Coast audiences respond to. No web search ran, so no individual creators are named.", [], "web") },
    { handle: "#yachtparty", platform: "tiktok" as Platform, why: unsure("Boat-day content under this tag is a comparison point for her water events.", [], "web") },
    { handle: "#over50style", platform: "youtube" as Platform, why: unsure("Style creators over 50 speak to the same audience; worth watching for hook ideas.", [], "web") },
  ];

  const shot_list: Claim[] = [
    solid("Guests arriving at the marina, filmed from the dock (ask first).", ["her_profile"], "her_data"),
    solid("The champagne toast, close up, in one steady take.", ["her_profile"], "her_data"),
    solid("A 30-second talk to camera: one wellness tip for women over 50.", ["her_profile"], "her_data"),
    solid("Table styling before guests arrive, as a quick time-lapse.", ["her_profile"], "her_data"),
    solid("Her getting ready for a gala: the dress, the earrings, the last look.", ["her_profile"], "her_data"),
  ];

  return { body: { audience, themes, hooks, cut_styles, best_times, comparable_creators, shot_list }, sources };
}
