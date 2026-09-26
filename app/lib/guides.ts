/// <reference types="vite/client" />
// The help guides, bundled at build time (section 12c): Markdown text changes need no code
// change, yet they ship with the build and work offline. Screenshots made by the help
// screenshots job (help/screenshots/<slug>-<n>.png and <slug>-<n>-phone.png) are bundled the
// same way; a step whose picture has not been made yet shows a placeholder frame instead.
import index from "../../help/index.json";
import { parseGuide, type ParsedGuide } from "./markdown";

const RAW = import.meta.glob("/help/guides/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const SHOTS = import.meta.glob("/help/screenshots/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export interface IndexGuide {
  slug: string;
  title: string;
  group: "getting_started" | "everyday" | "brand_deals" | "fix_it";
  screen: string | null;
}

export const GROUPS = index.groups as { key: IndexGuide["group"]; title: string }[];
export const INDEX = index.guides as IndexGuide[];

/**
 * A guide about the login screen (index "screen": "login") means nothing when the deployment has
 * no login (AUTH_MODE "open", production by the owner's choice), so open mode hides it.
 */
export const isLoginGuide = (g: Pick<IndexGuide, "screen">) => g.screen === "login";

/** The guides this deployment shows: all of them, minus the login guides in open mode. */
export function visibleGuides(mode: "open" | "code" | undefined): IndexGuide[] {
  return mode === "open" ? INDEX.filter((g) => !isLoginGuide(g)) : INDEX;
}

const cache = new Map<string, ParsedGuide>();

export function guide(slug: string): ParsedGuide | null {
  if (cache.has(slug)) return cache.get(slug)!;
  const raw = RAW[`/help/guides/${slug}.md`];
  if (raw === undefined) return null;
  const g = parseGuide(raw);
  cache.set(slug, g);
  return g;
}

export function allGuides(): { entry: IndexGuide; parsed: ParsedGuide | null }[] {
  return INDEX.map((entry) => ({ entry, parsed: guide(entry.slug) }));
}

/** Bundled URL for a screenshot path like /help/screenshots/send-a-pitch-2.png, or null if not made yet. */
export function shotUrl(path: string | null, phone = false): string | null {
  if (!path) return null;
  // A Look's own picture (public/looks/<id>.webp, made by the cut self-test): one image for both sizes.
  if (/^\/looks\/[a-z_]+\.webp$/.test(path)) return path;
  const p = phone ? path.replace(/\.png$/, "-phone.png") : path;
  return SHOTS[p] ?? null;
}

/** Plain-text search over titles and step text. Every word must match. */
export function searchGuides(q: string, mode?: "open" | "code"): IndexGuide[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const visible = new Set(visibleGuides(mode).map((g) => g.slug));
  return allGuides()
    .filter(({ entry, parsed }) => {
      if (!visible.has(entry.slug)) return false;
      const hay = `${entry.title.toLowerCase()} ${parsed?.text ?? ""}`;
      return words.every((w) => hay.includes(w));
    })
    .map((x) => x.entry);
}

export const CHECKLIST_KEY = "ss-help-checklist";
export const TOUR_KEY = "ss-tour-done";
export const LAST_SCREEN_KEY = "ss-last-screen";

export function lastScreen(): string {
  try {
    return sessionStorage.getItem(LAST_SCREEN_KEY) ?? "/";
  } catch {
    return "/";
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the ticks just won't stick */
  }
}

/** A pre-filled email to her helper that says which screen (and guide) she was on. */
export function helperMail(helper: string, screen: string, guideTitle?: string): string {
  const subject = guideTitle ? `Help with "${guideTitle}"` : "Help with the dashboard";
  const body = `Hi,\n\nI'm stuck${guideTitle ? ` on the guide "${guideTitle}"` : ""}.\nScreen: ${screen}\n\nWhat happened:\n`;
  return `mailto:${helper}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
