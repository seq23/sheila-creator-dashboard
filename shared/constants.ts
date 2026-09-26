// Numbers the plan locks (BUILD_PLAN.md sections 1, 7, 10, 10b, 11). Read by the app,
// the Worker and the unit tests, so a change here changes all three at once.

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube Shorts",
};

/** Hard cap: no channel ever gets more than this many posts per week. */
export const HARD_CAP_PER_CHANNEL_PER_WEEK = 10;

/** Launch defaults from the research baseline (section 10b). */
export const DEFAULT_WEEKLY_CAPS: Record<Platform, number> = {
  tiktok: 10,
  instagram: 7,
  youtube: 5,
};

/** Runway email threshold: under this many weeks of approved, unposted clips. */
export const DEFAULT_RUNWAY_THRESHOLD_WEEKS = 2;
/** "Time to dump" repeats every N days until a dump arrives. */
export const TIME_TO_DUMP_REPEAT_DAYS = 3;

/** Recycle door: never repost the same source to the same platform inside this window. */
export const DEFAULT_RECYCLE_COOLDOWN_DAYS = 90;

/** Raw originals are deleted this long after processing; clips kept until posted + this. */
export const RAW_RETENTION_DAYS = 7;
export const CLIP_RETENTION_AFTER_POST_DAYS = 30;
export const REJECTED_RETENTION_DAYS = 7;

/** Buffer only ever holds the next N days; free plan queue is 10 per channel. */
export const BUFFER_WINDOW_DAYS = 7;
export const BUFFER_QUEUE_LIMIT_PER_CHANNEL = 10;
export const BUFFER_MAX_RETRIES = 2;

/** Upload chunking: 10 MB parts (R2 minimum is 5 MB except the last). */
export const UPLOAD_PART_SIZE = 10 * 1024 * 1024;

/** Clip length bounds per recipe (section 8). */
export const RECIPES = {
  talking_head: { label: "Tight talking-head", minS: 20, maxS: 45 },
  hook_first: { label: "Hook-first", minS: 15, maxS: 60 },
  story: { label: "Story", minS: 45, maxS: 90 },
  montage: { label: "Montage", minS: 15, maxS: 45 },
  recycle: { label: "Recycled", minS: 15, maxS: 90 },
} as const;
export type Recipe = keyof typeof RECIPES;

/** Quality bar: clips scoring under this are hidden by default in Review. */
export const QUALITY_BAR = 0.45;

/** Launch posting slots (section 10b), in the audience's local time. day: 0 = Sunday. */
export interface Slot {
  day: number;
  hour: number;
  minute: number;
}
export const LAUNCH_SLOTS: Record<Platform, Slot[]> = {
  tiktok: [
    { day: 1, hour: 15, minute: 0 },
    { day: 2, hour: 16, minute: 0 },
    { day: 2, hour: 20, minute: 0 },
    { day: 3, hour: 17, minute: 0 },
    { day: 3, hour: 20, minute: 0 },
    { day: 4, hour: 15, minute: 0 },
    { day: 4, hour: 20, minute: 0 },
    { day: 5, hour: 16, minute: 0 },
    { day: 6, hour: 19, minute: 0 },
    { day: 0, hour: 9, minute: 0 },
  ],
  instagram: [
    { day: 1, hour: 19, minute: 0 },
    { day: 2, hour: 13, minute: 0 },
    { day: 2, hour: 19, minute: 0 },
    { day: 3, hour: 12, minute: 0 },
    { day: 3, hour: 20, minute: 0 },
    { day: 4, hour: 9, minute: 0 },
    { day: 0, hour: 21, minute: 0 },
  ],
  youtube: [
    { day: 2, hour: 16, minute: 0 },
    { day: 3, hour: 16, minute: 0 },
    { day: 4, hour: 17, minute: 0 },
    { day: 5, hour: 16, minute: 0 },
    { day: 6, hour: 17, minute: 0 },
  ],
};

export const REJECT_REASONS = ["too long", "not on brand", "bad hook", "bad cut", "other"] as const;

export const DEAL_STAGES = ["found", "drafted", "sent", "replied", "negotiating", "won", "passed"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/** Brand Profile fixed sections (section 5). */
export const BRAND_PROFILE_SECTIONS = [
  { key: "who", label: "Who she is" },
  { key: "audience", label: "Audience" },
  { key: "goals", label: "Goals (90-day and 1-year)" },
  { key: "voice", label: "Voice and tone" },
  { key: "themes", label: "Content themes (3–5)" },
  { key: "do_dont", label: "Do / Don't" },
  { key: "off_limits", label: "Off-limits topics" },
  { key: "deal_fit", label: "Brand-deal fit" },
  { key: "ctas", label: "Calls to action" },
] as const;
export type BrandProfileKey = (typeof BRAND_PROFILE_SECTIONS)[number]["key"];

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/3gpp"];
export const ACCEPTED_DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
];

/**
 * Settings → Features, every one ON by default (owner, 26 Sep 2026: "nothing should be hidden -
 * she can use it if she chooses, nothing switched off"). She can turn any of them off herself;
 * no switch ever hides a screen, a nav item or a button (validator nothing-hidden).
 */
export const DEFAULT_FEATURES = { voice: true, deeper_research: true, weekly_recap: true, help_ask: true } as const;
