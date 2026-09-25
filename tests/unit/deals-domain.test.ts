// Phase 10–12c pure rules: pitch follow-up scheduling, TikTok One eligibility, off-limits and
// public-contact rules, pitch drafts, the Gmail link, the help-guide parser, and the fake
// brand finder's contract.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canMove, followupsDueLine, nextFollowup } from "@worker/domain/deals";
import { afterFollowupSent, brandKey, clampFit, contactProblem, followupsDone, isRoleEmail, offLimitsTerms, sortContacts, validSentAt, violatesOffLimits } from "@worker/domain/brandfit";
import { TIKTOK_ONE, tiktokOneEligibility, views30d } from "@worker/domain/marketplace";
import { compact, parsePitch, starterPitch, type PitchInput } from "@worker/domain/pitch";
import { fakeBrands, normaliseBrand } from "@worker/jobs/brand_finder";
import { toneWav } from "@worker/jobs/voice";
import { gmailComposeUrl, pitchAsText } from "../../app/lib/gmail";
import { parseGuide, parseInline, SCREEN_ROUTES } from "../../app/lib/markdown";

const SENT = "2026-09-01T12:00:00.000Z";

describe("weekly recap: follow-ups due", () => {
  it("lists every due follow-up as brand (date), earliest first, in her timezone", () => {
    const line = followupsDueLine(
      [
        { brand: "Velvet & Vine Wraps", dueAt: "2026-10-02T03:30:00.000Z" }, // 1 Oct, 11:30 pm New York
        { brand: "Cedar & Salt Kitchen", dueAt: "2026-09-28T12:00:00.000Z" },
      ],
      "America/New_York",
    );
    expect(line).toBe("Follow-ups due: Cedar & Salt Kitchen (Mon, Sep 28), Velvet & Vine Wraps (Thu, Oct 1).");
  });
  it("is no line at all when nothing is due", () => {
    expect(followupsDueLine([], "America/New_York")).toBeNull();
  });
});

describe("pitch follow-ups (day 5, then day 12)", () => {
  it("a fresh send is waiting on the day-5 follow-up", () => {
    expect(followupsDone(SENT, nextFollowup(SENT, 0))).toBe(0);
  });
  it("sending the day-5 follow-up schedules day 12, then nothing", () => {
    const d5 = nextFollowup(SENT, 0);
    const d12 = afterFollowupSent(SENT, d5);
    expect(d12).toBe("2026-09-13T12:00:00.000Z");
    expect(followupsDone(SENT, d12)).toBe(1);
    expect(afterFollowupSent(SENT, d12)).toBeNull();
    expect(afterFollowupSent(SENT, null)).toBeNull();
  });
  it("a hand-moved date before day 12 still counts as the first follow-up", () => {
    expect(followupsDone(SENT, "2026-09-08T09:00:00.000Z")).toBe(0);
    expect(followupsDone(SENT, "2026-09-20T09:00:00.000Z")).toBe(1);
  });
  it("sent-at must be today or up to 60 days ago, never the future", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    expect(validSentAt(undefined, now)).toBe(now.toISOString());
    expect(validSentAt("2026-09-21T12:00:00.000Z", now)).toBe("2026-09-21T12:00:00.000Z");
    expect(validSentAt("2026-09-27T12:00:00.000Z", now)).toBeNull();
    expect(validSentAt("2026-07-01T12:00:00.000Z", now)).toBeNull();
    expect(validSentAt("not a date", now)).toBeNull();
  });
  it("mark sent then replied is a legal walk of the funnel; skipping is not", () => {
    expect(canMove("drafted", "sent")).toBe(true);
    expect(canMove("sent", "replied")).toBe(true);
    expect(canMove("sent", "found")).toBe(false);
    expect(canMove("replied", "won")).toBe(true);
  });
});

describe("TikTok One eligibility", () => {
  it("needs 10k followers, 1k views in 30 days and 3 recent posts", () => {
    expect(TIKTOK_ONE).toMatchObject({ minFollowers: 10_000, minViews30d: 1_000, minRecentPosts: 3 });
    const ok = tiktokOneEligibility({ followers: 10_000, views30d: 1_000, recentPosts: 3 });
    expect(ok.eligible).toBe(true);
    expect(ok.summary).toMatch(/You qualify/);
  });
  it("one short is not eligible and says which", () => {
    const r = tiktokOneEligibility({ followers: 9_999, views30d: 50_000, recentPosts: 12 });
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.label === "Followers")!.ok).toBe(false);
    expect(r.summary).toBe("Not yet: followers 9,999 of 10,000.");
  });
  it("no stats at all asks her to connect, never claims eligibility", () => {
    const r = tiktokOneEligibility({ followers: null, views30d: null, recentPosts: null });
    expect(r.eligible).toBe(false);
    expect(r.hasData).toBe(false);
    expect(r.summary).toMatch(/Connect your TikTok stats/);
  });
  it("30-day views: per-post metrics win, else average × recent posts", () => {
    expect(views30d([400, 700], 5000, 2)).toBe(1100);
    expect(views30d([], 300, 4)).toBe(1200);
    expect(views30d([], null, 4)).toBeNull();
  });
});

describe("off-limits: never suggested", () => {
  const terms = offLimitsTerms("Alcohol, gambling and diet pills\n- No politics.");
  it("splits her section into terms", () => {
    expect(terms).toEqual(expect.arrayContaining(["alcohol", "gambling", "diet pills", "politics"]));
  });
  it("matches name, category or reason, plural-tolerant, whole words only", () => {
    expect(violatesOffLimits({ name: "Midnight Spirits", categories: ["alcohol"] }, terms)).toBe("alcohol");
    expect(violatesOffLimits({ name: "Lucky Casino", fit_reasons: ["Gambling brand with a creator program"] }, terms)).toBe("gambling");
    expect(violatesOffLimits({ name: "Slim Diet Pill Co" }, terms)).toBe("diet pills");
    expect(violatesOffLimits({ name: "Maison Candles", categories: ["home"] }, terms)).toBeNull();
    // "gambling" must not hit "gamblingly"-style substrings of unrelated words
    expect(violatesOffLimits({ name: "Politicsworld" }, ["politics"])).toBeNull();
  });
  it("an empty section blocks nothing", () => {
    expect(offLimitsTerms("")).toEqual([]);
    expect(violatesOffLimits({ name: "Anything" }, [])).toBeNull();
  });
  it("the fake finder's off-limits brand is caught by the demo profile's list", () => {
    const brands = fakeBrands("Table styling");
    expect(brands.length).toBeGreaterThanOrEqual(6);
    expect(brands.length).toBeLessThanOrEqual(8);
    const blocked = brands.filter((b) => violatesOffLimits(b, offLimitsTerms("Alcohol, gambling, diet pills")));
    expect(blocked.map((b) => b.name)).toEqual(["Midnight Spirits Co."]);
  });
});

describe("public business contacts only", () => {
  it("role addresses at a business domain pass; personal and free-mail addresses do not", () => {
    for (const ok of ["partnerships@brand.com", "pr@brand.co.uk", "us-partnerships@brand.com", "creators.team@brand.com", "hello@brand.example"]) expect(isRoleEmail(ok), ok).toBe(true);
    for (const bad of ["jane.doe@brand.com", "jdoe@brand.com", "partnerships@gmail.com", "pr@icloud.com", "not an email"]) expect(isRoleEmail(bad), bad).toBe(false);
  });
  it("every contact needs the public page it was found on", () => {
    expect(contactProblem({ kind: "role_email", value: "pr@brand.com", found_on_url: "" })).toMatch(/page it was found on/);
    expect(contactProblem({ kind: "role_email", value: "pr@brand.com", found_on_url: "javascript:alert(1)" })).toMatch(/page it was found on/);
    expect(contactProblem({ kind: "role_email", value: "pr@brand.com", found_on_url: "https://brand.com/press" })).toBeNull();
  });
  it("forms must be links; agencies may be a link or a role address", () => {
    expect(contactProblem({ kind: "form", value: "https://brand.com/apply", found_on_url: "https://brand.com/creators" })).toBeNull();
    expect(contactProblem({ kind: "form", value: "apply here", found_on_url: "https://brand.com/creators" })).toMatch(/web link/);
    expect(contactProblem({ kind: "agency", value: "talent@agency.example", found_on_url: "https://brand.com/press" })).toBeNull();
    expect(contactProblem({ kind: "agency", value: "sam@agency.example", found_on_url: "https://brand.com/press" })).toMatch(/never a personal one/);
  });
  it("priority: application form, then role email, then agency", () => {
    const sorted = sortContacts([{ kind: "agency" as const }, { kind: "role_email" as const }, { kind: "form" as const }]);
    expect(sorted.map((c) => c.kind)).toEqual(["form", "role_email", "agency"]);
  });
  it("every fake finder contact passes the same rules the Worker applies", () => {
    for (const b of fakeBrands("x")) for (const c of b.contacts) expect(contactProblem(c), `${b.name} ${c.value}`).toBeNull();
  });
});

describe("brand matching and the finder result shape", () => {
  it("dedupes by website host, else by name", () => {
    expect(brandKey({ name: "X", website: "https://www.brand.com/shop" })).toBe("brand.com");
    expect(brandKey({ name: "  Golden  Hour ", website: null })).toBe("golden hour");
  });
  it("fit accepts 0–1 or 0–100 and clamps", () => {
    expect(clampFit(87)).toBe(0.87);
    expect(clampFit(0.5)).toBe(0.5);
    expect(clampFit(250)).toBe(1);
    expect(clampFit("nope")).toBe(0);
  });
  it("normaliseBrand drops malformed input and unsafe links", () => {
    expect(normaliseBrand({})).toBeNull();
    const b = normaliseBrand({ name: "Brand", website: "javascript:alert(1)", socials: { tiktok: "https://tiktok.com/@b", "bad key": "https://x.y" }, source_links: ["https://a.b/c", "ftp://x"], fit_score: 91 })!;
    expect(b.website).toBeNull();
    expect(b.socials).toEqual({ tiktok: "https://tiktok.com/@b" });
    expect(b.source_links).toEqual(["https://a.b/c"]);
    expect(b.fit_score).toBe(0.91);
  });
});

const INPUT: PitchInput = {
  creatorName: "Sheila Bruce",
  voice: "warm",
  audience: "Women 30-55 who love hosting.",
  themes: ["Table styling", "Easy entertaining"],
  dealFit: "home brands",
  brand: { name: "Golden Hour Tableware", website: "https://goldenhour.example/", why_now: null, fit_reasons: [], product: null, herPick: false },
  numbers: [
    { platform: "tiktok", followers: 12400, avg_views: 3100 },
    { platform: "instagram", followers: 0, avg_views: 0 },
  ],
  clipLinks: ["https://x.example/media/a", "https://x.example/media/b"],
  mediaKitUrl: "https://x.example/kit/sheila",
  contactKind: "role_email",
};

describe("pitch drafts", () => {
  it("the starter draft has every part the plan asks for", () => {
    const d = starterPitch(INPUT);
    expect(d.subject).toBe("Creator partnership idea: Golden Hour Tableware × Sheila");
    expect(d.body).toContain("12.4K followers on TikTok");
    expect(d.body).not.toContain("0 followers on Instagram");
    for (const l of INPUT.clipLinks) expect(d.body).toContain(l);
    expect(d.body).toContain(`Media kit: ${INPUT.mediaKitUrl}`);
    expect(d.body).toMatch(/paid partnership/);
    expect(d.dm_text).toContain(INPUT.mediaKitUrl);
    expect(d.followup_1 && d.followup_2).toBeTruthy();
  });
  it("only claims she uses the product when it is a brand she listed", () => {
    expect(starterPitch(INPUT).body).not.toMatch(/already use/);
    expect(starterPitch({ ...INPUT, brand: { ...INPUT.brand, herPick: true } }).body).toMatch(/already use/);
  });
  it("a model answer missing a part is refused; missing links are put back", () => {
    expect(parsePitch('{"subject":"x","body":"y"}', INPUT)).toBeNull();
    expect(parsePitch("not json", INPUT)).toBeNull();
    const ok = parsePitch('Here: {"subject":"S","body":"Hi there","dm_text":"d","followup_1":"f1","followup_2":"f2"}', INPUT)!;
    expect(ok.body).toContain(INPUT.mediaKitUrl);
    for (const l of INPUT.clipLinks) expect(ok.body).toContain(l);
  });
  it("numbers read the way people say them", () => {
    expect(compact(950)).toBe("950");
    expect(compact(12400)).toBe("12.4K");
    expect(compact(250000)).toBe("250K");
    expect(compact(1_200_000)).toBe("1.2M");
  });
});

describe("Open in Gmail", () => {
  it("builds the pre-filled compose link with %20 spaces and every field encoded", () => {
    const url = gmailComposeUrl("pr@brand.com", "Hi & hello", "Line 1\nLine 2 #ad");
    expect(url.startsWith("https://mail.google.com/mail/?view=cm&to=pr%40brand.com&su=Hi%20%26%20hello&body=")).toBe(true);
    expect(url).not.toContain("+");
    const u = new URL(url);
    expect(u.searchParams.get("body")).toBe("Line 1\nLine 2 #ad");
  });
  it("Copy carries the subject and the body", () => {
    expect(pitchAsText("S", "B")).toBe("Subject: S\n\nB");
  });
});

describe("help guides", () => {
  const dir = path.resolve("help/guides");
  const mine = ["update-your-media-kit", "send-a-pitch", "mark-a-reply", "record-your-voice", "connect-hunter"];
  it.each(mine)("%s has 3–8 real steps, one picture each, a target and today's check date", (slug) => {
    const g = parseGuide(readFileSync(path.join(dir, `${slug}.md`), "utf8"));
    expect(g.steps.length).toBeGreaterThanOrEqual(3);
    expect(g.steps.length).toBeLessThanOrEqual(8);
    g.steps.forEach((s, i) => {
      expect(s.image).toBe(`/help/screenshots/${slug}-${i + 1}.png`);
      expect(s.blocks.length).toBeGreaterThan(0);
      expect(s.route === "external" || !!s.target, `${slug} step ${i + 1} needs a target`).toBe(true);
    });
    expect(g.meta.last_checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(g.meta.screen && SCREEN_ROUTES[g.meta.screen]).toBeTruthy();
    if (g.meta.fix) expect(readFileSync(path.join(dir, `${g.meta.fix}.md`), "utf8").length).toBeGreaterThan(0);
  });
  it("the parser reads frontmatter, steps, directives and the closing section", () => {
    const g = parseGuide(
      '---\ntitle: "T"\ngroup: everyday\nscreen: deals\nlast_checked: 2026-09-25\ntarget: "role=button[name=\\"Go\\"]"\nfix: a-post-failed\n---\n\nIntro **bold**.\n\n## Step 1: Open it\n\n![Step 1](/help/screenshots/t-1.png)\n<!-- click: .card -->\n\nTap **Go**.\n\n## Two\n\n![Step 2](/help/screenshots/t-2.png)\n<!-- target: .x -->\n<!-- route: /deals?tab=kit -->\n\n- one\n- two\n\n## Did this work?\n\nIf not, tap No.\n',
    );
    expect(g.meta).toMatchObject({ title: "T", screen: "deals", target: 'role=button[name="Go"]', fix: "a-post-failed" });
    expect(g.steps.map((s) => s.title)).toEqual(["Open it", "Two"]);
    expect(g.steps[0]).toMatchObject({ click: ".card", target: 'role=button[name="Go"]', route: null });
    expect(g.steps[1]).toMatchObject({ target: ".x", route: "/deals?tab=kit" });
    expect(g.steps[1].blocks[0]).toEqual({ kind: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] });
    expect(g.outro.length).toBe(1);
    expect(g.text).toContain("tap go");
  });
  it("never passes a script link through", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x" }, { t: "text", v: ")" }]);
    expect(parseInline("[Hunter](https://hunter.io)")).toEqual([{ t: "link", v: "Hunter", href: "https://hunter.io" }]);
  });
});

describe("voice fake output", () => {
  it("is a real, playable WAV", () => {
    const w = toneWav(1);
    expect(new TextDecoder().decode(w.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(w.slice(8, 12))).toBe("WAVE");
    expect(w.byteLength).toBe(44 + 16_000 * 2);
  });
});
