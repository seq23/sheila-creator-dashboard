// Deal tracker stages (section 12b): Found → Drafted → Sent → Replied → Negotiating → Won / Passed.
import { DEAL_STAGES, type DealStage } from "@shared/constants";

export const STAGE_ORDER = DEAL_STAGES;

export function canMove(from: DealStage, to: DealStage): boolean {
  if (from === to) return false;
  if (to === "passed") return from !== "won";
  if (from === "won" || from === "passed") return to === "negotiating"; // reopen only
  const fi = STAGE_ORDER.indexOf(from);
  const ti = STAGE_ORDER.indexOf(to);
  return ti === fi + 1 || ti === fi - 1 || (from === "replied" && to === "won") || (from === "negotiating" && to === "won");
}

/**
 * The weekly recap's follow-ups line: "Follow-ups due: <brand> (<date>), …" for every pitch
 * whose follow-up falls in the coming week or is already overdue; null when there is none, so
 * the recap does not carry an empty line. Dates read in her audience timezone.
 */
export function followupsDueLine(due: { brand: string; dueAt: string }[], timeZone: string): string | null {
  if (!due.length) return null;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const parts = [...due].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((d) => `${d.brand} (${fmt.format(new Date(d.dueAt))})`);
  return `Follow-ups due: ${parts.join(", ")}.`;
}

/** Follow-ups: day 5 and day 12 after sending (section 12b.4). */
export function nextFollowup(sentAt: string, followupsSent: 0 | 1 | 2): string | null {
  const base = new Date(sentAt).getTime();
  if (followupsSent === 0) return new Date(base + 5 * 86400_000).toISOString();
  if (followupsSent === 1) return new Date(base + 12 * 86400_000).toISOString();
  return null;
}
