// Stats (BUILD_PLAN.md section 4: "What's working: top clips, best times, best cut styles";
// phase 8 learning loop). Her accounts per platform, top videos, best posting times, best cut
// styles, and whether the Calendar is on her own best times yet. Instagram and YouTube sync
// through their stats connections; TikTok comes from the TikTok Studio export she uploads here.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PLATFORMS, PLATFORM_LABEL, type Platform, type Slot } from "@shared/constants";
import { ApiFailure, get, post } from "../lib/api";
import { ago, fmtDate, plural } from "../lib/format";
import { Card, Empty, HelpButton, Notice, PageHead, Skeleton, useLoad, useToast } from "../components/ui";
import "../styles/stats.css";

interface StatsData {
  accounts: { platform: Platform; followers: number; avg_views: number; captured_at: string; source: string }[];
  topClips: { id: string; platform: Platform; title: string | null; recipe: string | null; url: string | null; posted_at: string | null; views: number; likes: number; origin: string }[];
  bestTimes: Record<Platform, { day: number; hour: number; posts: number; avg_views: number }[]>;
  bestRecipes: { recipe: string; label: string; posts: number; avg_views: number }[];
  learning: Record<Platform, { videos: number; days: number; needDays: number; ready: boolean }>;
  learnedSlots: Partial<Record<Platform, Slot[]>>;
  learnedAt: string | null;
  connections: { service: string; status: string; last_ok_at: string | null; meta: Record<string, unknown> }[];
  job: { id: string; status: string; safe_error: string | null; created_at: string } | null;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
const num = (n: number) => n.toLocaleString();
const SERVICE: Record<Platform, string> = { instagram: "meta", youtube: "google", tiktok: "tiktok" };

export function Stats() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => get<StatsData>("/api/stats"));
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const running = !!data?.job && ["queued", "dispatched", "running"].includes(data.job.status);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 6000);
    return () => clearInterval(t);
  }, [running, reload]);

  const conn = (p: Platform) => data?.connections.find((c) => c.service === SERVICE[p]) ?? null;
  const canSync = !!data?.connections.some((c) => (c.service === "meta" || c.service === "google") && c.status === "ok");
  // One next step only while nothing feeds the numbers yet: connecting.
  const nothingConnected = !!data && !canSync && !data.connections.some((c) => c.service === "tiktok" && c.meta.last_import_at);

  async function sync() {
    setBusy("sync");
    try {
      await post("/api/stats/sync");
      toast.ok("Getting your latest Instagram and YouTube results. A few minutes.");
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function importTikTok(files: FileList) {
    const f = files[0];
    if (!f) return;
    setBusy("import");
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/stats/tiktok-import", { method: "POST", body: form, credentials: "same-origin" });
      const body = (await res.json()) as { error?: string; fix_guide?: string; videos?: number; kind?: string; followers?: number | null };
      if (!res.ok) {
        toast.bad(new ApiFailure(res.status, { error: body.error ?? "That file could not be read.", fix_guide: body.fix_guide ?? "upload-your-tiktok-export" }));
        return;
      }
      toast.ok(body.kind === "followers" ? `Follower count updated${body.followers != null ? `: ${num(body.followers)}` : ""}.` : `Imported ${plural(body.videos ?? 0, "TikTok video")}.`);
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(null);
      reload();
    }
  }

  const hasAny = !!data && (data.accounts.length > 0 || data.topClips.length > 0);

  return (
    <div className="page">
      <PageHead title="Stats" lede="What’s working: your numbers, your best videos and the times your audience watches.">
        {canSync ? (
          <button className="btn quiet" onClick={sync} disabled={running || busy === "sync"}>
            {running ? "Updating…" : "Update numbers"}
          </button>
        ) : (
          <Link className={nothingConnected ? "btn" : "btn quiet"} data-primary={nothingConnected || undefined} to="/settings/connections">
            Connect Instagram / YouTube
          </Link>
        )}
        <button className="btn quiet" onClick={() => fileRef.current?.click()} disabled={busy === "import"}>
          {busy === "import" ? "Importing…" : "Upload TikTok export"}
        </button>
        <input ref={fileRef} type="file" hidden aria-label="Choose your TikTok export" accept=".csv,text/csv" onChange={(e) => (e.target.files ? importTikTok(e.target.files).finally(() => (e.target.value = "")) : undefined)} />
      </PageHead>

      {loading && !data ? <Skeleton blocks={3} columns={3} /> : null}
      {running ? (
        <Notice tone="info">
          <span>
            <strong>Updating…</strong> started {ago(data?.job?.created_at)}. Your numbers update here when it finishes.
          </span>
        </Notice>
      ) : null}
      {data?.job?.status === "failed" ? (
        <Notice tone="bad">
          <span>
            The last update stopped ({data.job.safe_error ?? "unknown reason"}). <Link to="/help/connect-stats">How to fix</Link>
          </span>
        </Notice>
      ) : null}

      {data && !hasAny ? (
        <Empty title="No results yet" secondary={{ to: "/help/upload-your-tiktok-export", label: "How to get the TikTok export" }}>
          Connect Instagram and YouTube stats, and upload your TikTok export from TikTok Studio. After about 4 weeks of posting, the Calendar switches from the big studies’ times to your own best times.
        </Empty>
      ) : null}

      {data ? (
        <>
          <div className="grid cols-3">
            {PLATFORMS.map((p) => {
              const a = data.accounts.find((x) => x.platform === p);
              const c = conn(p);
              const when = p === "tiktok" ? (c?.meta.last_import_at as string | undefined) : ((c?.meta.last_sync_at as string | undefined) ?? c?.last_ok_at ?? undefined);
              return (
                <Card key={p}>
                  <div className="card-label">{PLATFORM_LABEL[p]}</div>
                  {a ? (
                    <>
                      <div className="stat">{num(a.followers)}</div>
                      <div className="hint nums">followers · {num(a.avg_views)} average views</div>
                    </>
                  ) : (
                    <div className="soft">No numbers yet</div>
                  )}
                  <div className="hint">
                    {when ? `${p === "tiktok" ? "Imported" : "Updated"} ${ago(when)}` : p === "tiktok" ? "Upload the export from TikTok Studio" : c?.status === "error" ? "Needs you to reconnect" : "Not connected"}
                  </div>
                </Card>
              );
            })}
          </div>

          <section className="section" aria-labelledby="learn-h">
            <h2 id="learn-h">Your posting times</h2>
            <Card className="flat">
              <div className="list">
                {PLATFORMS.map((p) => {
                  const L = data.learning[p];
                  const learned = data.learnedSlots[p];
                  return (
                    <div key={p} className="list-row">
                      <span className={`pill ${learned ? "ok" : ""}`}>{learned ? "Your times" : "Study times"}</span>
                      <div className="grow">
                        <div className="title">{PLATFORM_LABEL[p]}</div>
                        <div className="meta nums">
                          {learned
                            ? `From your own results: ${learned.map((s) => `${DAY[s.day]} ${hour(s.hour)}`).join(" · ")}`
                            : `Launch times from the big studies until there are 4 weeks of your results (${Math.min(L.days, L.needDays)} of ${L.needDays} days, ${plural(L.videos, "video")}).`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <div className="stats-split">
            <section className="section" aria-labelledby="top-h">
              <h2 id="top-h">Top clips</h2>
              {data.topClips.length === 0 ? (
                <p className="soft">Your best videos show here once results come in.</p>
              ) : (
                <Card className="flat">
                  <ol className="list stats-top">
                    {data.topClips.map((t, i) => (
                      <li key={t.id} className="list-row">
                        <span className="stats-rank nums">{i + 1}</span>
                        <div className="grow">
                          <div className="title stats-ellipsis">{t.title || "Untitled video"}</div>
                          <div className="meta">
                            {PLATFORM_LABEL[t.platform]}
                            {t.posted_at ? ` · ${fmtDate(t.posted_at)}` : ""}
                            {t.origin === "dashboard" ? " · made here" : ""}
                          </div>
                        </div>
                        <div className="stats-views nums">
                          <strong>{num(t.views)}</strong>
                          <span className="meta">views</span>
                        </div>
                        {t.url ? (
                          <a className="btn quiet small" href={t.url} target="_blank" rel="noreferrer" aria-label="Open this video">
                            Open
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </section>

            <section className="section" aria-labelledby="times-h">
              <h2 id="times-h">Best times</h2>
              {PLATFORMS.map((p) => {
                const rows = data.bestTimes[p];
                const max = Math.max(1, ...rows.map((r) => r.avg_views));
                return (
                  <Card key={p} className="flat">
                    <div className="card-label">{PLATFORM_LABEL[p]}</div>
                    {rows.length === 0 ? <div className="hint">No results yet.</div> : null}
                    {rows.map((r) => (
                      <div key={`${r.day}-${r.hour}`} className="stats-bar">
                        <span className="mono stats-when">
                          {DAY[r.day]} {hour(r.hour)}
                        </span>
                        <div className="meter">
                          <span style={{ width: `${(r.avg_views / max) * 100}%` }} />
                        </div>
                        <span className="meta stats-num">
                          {num(r.avg_views)} avg · {plural(r.posts, "post")}
                        </span>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </section>
          </div>

          <section className="section" aria-labelledby="cuts-h">
            <h2 id="cuts-h">Best cut styles</h2>
            {data.bestRecipes.length === 0 ? (
              <p className="soft">Shows once clips made here have results.</p>
            ) : (
              <Card className="flat">
                {data.bestRecipes.map((r) => (
                  <div key={r.recipe} className="stats-bar">
                    <span className="stats-when">{r.label}</span>
                    <div className="meter">
                      <span style={{ width: `${(r.avg_views / Math.max(1, data.bestRecipes[0].avg_views)) * 100}%` }} />
                    </div>
                    <span className="meta stats-num">
                      {num(r.avg_views)} avg · {plural(r.posts, "post")}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      ) : null}
      <HelpButton guide="upload-your-tiktok-export" />
    </div>
  );
}
