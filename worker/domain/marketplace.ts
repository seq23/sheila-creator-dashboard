// Platform brand marketplaces (section 12b.7). TikTok One (Creator Marketplace) currently asks
// for 10,000+ followers, 1,000+ views in the last 30 days, 3+ recent posts and age 18+ (per a
// 2026 creator guide; checked again before relying on it). Age is not something the dashboard
// knows, so it is shown as a line she confirms on TikTok, never counted as met.

export const TIKTOK_ONE = {
  name: "TikTok One (Creator Marketplace)",
  minFollowers: 10_000,
  minViews30d: 1_000,
  minRecentPosts: 3,
  recentWindowDays: 30,
  checkedOn: "2026-09-25",
} as const;

export interface MarketplaceCheck {
  label: string;
  have: number | null;
  need: number;
  ok: boolean;
}

export interface MarketplaceEligibility {
  marketplace: string;
  eligible: boolean;
  checks: MarketplaceCheck[];
  /** Plain sentence for the Deals screen. */
  summary: string;
  /** False when we have no TikTok numbers at all (connect stats or upload the export). */
  hasData: boolean;
}

export interface TikTokNumbers {
  followers: number | null;
  views30d: number | null;
  recentPosts: number | null;
}

export function tiktokOneEligibility(n: TikTokNumbers): MarketplaceEligibility {
  const checks: MarketplaceCheck[] = [
    { label: "Followers", have: n.followers, need: TIKTOK_ONE.minFollowers, ok: (n.followers ?? 0) >= TIKTOK_ONE.minFollowers },
    { label: "Views in the last 30 days", have: n.views30d, need: TIKTOK_ONE.minViews30d, ok: (n.views30d ?? 0) >= TIKTOK_ONE.minViews30d },
    { label: "Posts in the last 30 days", have: n.recentPosts, need: TIKTOK_ONE.minRecentPosts, ok: (n.recentPosts ?? 0) >= TIKTOK_ONE.minRecentPosts },
  ];
  const hasData = n.followers !== null;
  const eligible = hasData && checks.every((c) => c.ok);
  const missing = checks.filter((c) => !c.ok);
  let summary: string;
  if (!hasData) summary = "Connect your TikTok stats (or upload the export) and we'll tell you when you qualify.";
  else if (eligible) summary = "You qualify for TikTok One. Apply in TikTok Studio → Creator tools → TikTok One (you must be 18 or older).";
  else
    summary = `Not yet: ${missing
      .map((c) => `${c.label.toLowerCase()} ${fmt(c.have ?? 0)} of ${fmt(c.need)}`)
      .join(", ")}.`;
  return { marketplace: TIKTOK_ONE.name, eligible, checks, summary, hasData };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Views in the last 30 days: the sum of each recent TikTok post's latest view count when we
 * have per-post metrics; otherwise average views × recent posts from the account stats.
 */
export function views30d(perPostLatestViews: number[], avgViews: number | null, recentPosts: number): number | null {
  if (perPostLatestViews.length) return perPostLatestViews.reduce((a, b) => a + b, 0);
  if (avgViews === null) return null;
  return avgViews * recentPosts;
}
