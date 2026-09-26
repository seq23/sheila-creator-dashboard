// API shapes shared by the React app and the Worker. Keep these plain (JSON-safe).
import type { BrandProfileKey, DealStage, Platform, Recipe } from "./constants";

export type Light = "green" | "yellow" | "red" | "grey";

export interface Me {
  id: string;
  email: string;
  role: "owner" | "helper";
  appName: string;
  features: Features;
  /** "open": no login on this deployment (no log-in guide, no log-out). "code": the email-code login. */
  authMode: "open" | "code";
}

export interface Features {
  voice: boolean;
  deeper_research: boolean;
  weekly_recap: boolean;
  help_ask: boolean;
}

export interface HealthItem {
  name: string;
  light: Light;
  note: string;
  fix_guide: string | null;
  checked_at: string;
}

export interface HomeSummary {
  today: string;
  runway: { weeks: number; approvedClips: number; thresholdWeeks: number; weeklyNeed: number };
  thisWeek: { posted: number; planned: number; perPlatform: Record<Platform, { posted: number; cap: number }> };
  waiting: { clips: number; dumpsCutting: number; briefNeedsApproval: boolean; profileUnlocked: boolean };
  health: HealthItem[];
  followups: { dealId: string; brand: string; dueAt: string }[];
  recentDumps: DumpSummary[];
}

export interface DumpSummary {
  id: string;
  door: "new" | "recycle";
  notes: string;
  status: "uploading" | "queued" | "cutting" | "ready" | "reviewed" | "failed";
  files: number;
  clips_made: number;
  created_at: string;
  ready_at: string | null;
  error_summary: string | null;
  progress: { step: string; done: number; total: number } | null;
}

export interface AssetRow {
  id: string;
  dump_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  upload_status: "uploading" | "uploaded" | "failed" | "aborted";
  file_note: string | null;
  original_platform: string | null;
  original_posted_at: string | null;
  original_views: number | null;
}

export interface ClipRow {
  id: string;
  asset_id: string;
  dump_id: string;
  start_s: number;
  end_s: number;
  recipe: Recipe;
  hook_text: string;
  hook_alt: string | null;
  caption: string;
  hashtags: string;
  platforms: Platform[];
  score: number;
  status: "draft" | "approved" | "rejected" | "deleted";
  reject_reason: string | null;
  paid_partnership: boolean;
  hidden: boolean;
  created_at: string;
  media_url: string;
  cover_url: string | null;
  source_file: string;
  door: "new" | "recycle";
}

export interface PostRow {
  id: string;
  clip_id: string;
  platform: Platform;
  scheduled_at: string;
  status: "planned" | "in_buffer" | "posted" | "failed" | "unscheduled";
  url: string | null;
  error: string | null;
  hook_text: string;
  cover_url: string | null;
  recipe: Recipe;
  door: "new" | "recycle";
}

export interface SettingsShape {
  weekly_caps: Record<Platform, number>;
  hard_cap_per_channel: number;
  runway_threshold_weeks: number;
  notify_emails: string[];
  posting_slots_source: "research" | "custom";
  features: Features;
  recycle_cooldown_days: number;
  helper_email: string | null;
  audience_timezone: string;
}

export interface ConnectionView {
  service: "buffer" | "openrouter" | "firecrawl" | "resend" | "hunter" | "meta" | "google" | "tiktok" | "github" | "elevenlabs";
  status: "missing" | "ok" | "error" | "disconnected";
  meta: Record<string, unknown>;
  last_ok_at: string | null;
  last_error: string | null;
}

export type BrandProfileSections = Record<BrandProfileKey, string>;

export interface BrandProfileView {
  version: number;
  sections: BrandProfileSections;
  locked: boolean;
  locked_at: string | null;
  source: "draft" | "edited" | "rollback";
  created_at: string;
}

export interface BrandDocRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  extract_status: "pending" | "extracting" | "done" | "failed" | "unreadable";
  extract_error: string | null;
  uploaded_at: string;
}

export interface Claim {
  text: string;
  source_ids: string[];
  basis: "her_data" | "web" | "upload";
  confidence: "solid" | "uncertain";
}

export interface BriefSource {
  id: string;
  url: string | null;
  title: string;
  kind: "her_data" | "web" | "upload";
}

export interface BriefBody {
  audience: Claim[];
  themes: { title: string; claims: Claim[] }[];
  hooks: Claim[];
  cut_styles: Claim[];
  best_times: Record<Platform, { day: number; hour: number; minute: number; claim: Claim }[]>;
  comparable_creators: { handle: string; platform: Platform; why: Claim }[];
  shot_list: Claim[];
}

export interface BriefView {
  version: number;
  body: BriefBody;
  sources: BriefSource[];
  status: "draft" | "approved" | "superseded";
  approved_at: string | null;
  created_at: string;
}

export interface BrandCard {
  id: string;
  name: string;
  website: string | null;
  program_url: string | null;
  socials: Record<string, string>;
  fit_score: number;
  fit_reasons: string[];
  why_now: string | null;
  source_links: string[];
  origin: "her_list" | "finder" | "program_search";
  status: "suggested" | "saved" | "hidden";
  contacts: { id: string; kind: "form" | "role_email" | "agency"; value: string; found_on_url: string }[];
  deal: { id: string; stage: DealStage; next_followup_at: string | null } | null;
  pitch: PitchView | null;
}

export interface PitchView {
  id: string;
  brand_id: string;
  contact_id: string | null;
  subject: string;
  body: string;
  dm_text: string;
  followup_1: string;
  followup_2: string;
  clip_links: string[];
  status: "drafted" | "sent" | "replied" | "closed";
  sent_at: string | null;
  next_followup_at: string | null;
}

export interface MediaKitPublic {
  name: string;
  bio: string;
  photo_url: string | null;
  themes: string[];
  audience: string;
  platforms: { platform: Platform; followers: number; avg_views: number }[];
  featured: { id: string; hook_text: string; media_url: string; cover_url: string | null }[];
  past_partners: string[];
  rates: Record<string, string> | null;
  contact_email: string | null;
}

export interface HelpGuideMeta {
  slug: string;
  title: string;
  group: "getting_started" | "everyday" | "brand_deals" | "fix_it";
  screen: string | null;
  steps: number;
  last_checked: string | null;
}

export interface JobRow {
  id: string;
  type: "cut" | "extract" | "research" | "brand_finder" | "voice" | "help_screenshots" | "metrics";
  status: "queued" | "dispatched" | "running" | "done" | "failed";
  ref_id: string | null;
  safe_error: string | null;
  progress: { step: string; done: number; total: number } | null;
  created_at: string;
  finished_at: string | null;
}

export interface ApiError {
  error: string;
  fix_guide?: string;
}
