import { Link } from "react-router-dom";
import type { HomeSummary } from "@shared/types";
import { get } from "../lib/api";
import { fmtDate, plural } from "../lib/format";
import { foldHealth } from "../lib/health";
import { Card, Dot, Empty, HelpButton, Notice, PageHead, Skeleton, Stat, useLoad } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state";
import { PLATFORM_LABEL, PLATFORMS } from "@shared/constants";
import "../styles/home.css";

const DUMP_STATUS: Record<HomeSummary["recentDumps"][number]["status"], { text: string; tone: "ok" | "warn" | "bad" | "" }> = {
  uploading: { text: "Still uploading", tone: "warn" },
  queued: { text: "Waiting to cut", tone: "" },
  cutting: { text: "Cutting…", tone: "" },
  ready: { text: "Ready for review", tone: "ok" },
  reviewed: { text: "Reviewed", tone: "ok" },
  failed: { text: "Needs a look", tone: "bad" },
};

export function Home() {
  const { me } = useApp();
  const { data, loading, error } = useLoad(() => get<HomeSummary>("/api/home"));
  const firstName = me?.role === "owner" ? "Sheila" : (me?.email.split("@")[0] ?? "");

  return (
    <div className="page">
      <PageHead eyebrow={fmtDate(new Date().toISOString(), { weekday: "long", month: "short", day: "numeric" })} title={`Hi ${firstName}`} lede="What needs you today, and how the week is going.">
        <Link to="/dump" className="btn big" data-primary>
          + Dump videos
        </Link>
      </PageHead>

      {loading && !data ? (
        <>
          <Skeleton blocks={4} columns={4} />
          <Skeleton blocks={2} columns={2} />
        </>
      ) : null}
      {error ? <Notice tone="bad">The dashboard could not load your numbers. Pull down to refresh, or check your connection.</Notice> : null}

      {data ? (
        <>
          {data.waiting.profileUnlocked ? (
            <Notice tone="info">
              <span>
                <strong>First things first.</strong> Upload your brand docs and lock your Brand Profile so every clip sounds like you.{" "}
                <Link to="/brain">Open Client Brain</Link>
              </span>
            </Notice>
          ) : data.waiting.briefNeedsApproval ? (
            <Notice tone="info">
              <span>
                <strong>Your Research Brief is ready.</strong> Read it and approve it before the first clips are cut. <Link to="/research">Open Research</Link>
              </span>
            </Notice>
          ) : null}

          <div className="grid cols-4 home-stats">
            <Card to="/review" accent={data.waiting.clips > 0}>
              <Stat
                label="Waiting for you"
                value={plural(data.waiting.clips, "clip")}
                sub={
                  data.waiting.clips ? (
                    <strong className="home-go">
                      Review now <Icon name="arrow" size="sm" />
                    </strong>
                  ) : data.waiting.dumpsCutting ? (
                    `${plural(data.waiting.dumpsCutting, "dump")} cutting`
                  ) : (
                    "Nothing to review"
                  )
                }
              />
            </Card>
            <Card>
              <Stat
                label="Runway"
                value={Number.isFinite(data.runway.weeks) ? `${data.runway.weeks} weeks` : "∞"}
                meter={{ fraction: Number.isFinite(data.runway.weeks) ? Math.min(1, data.runway.weeks / (data.runway.thresholdWeeks * 2)) : 1, tone: data.runway.weeks < data.runway.thresholdWeeks ? "warn" : "ok" }}
                sub={`${plural(data.runway.approvedClips, "approved clip")} left · email at ${data.runway.thresholdWeeks} weeks`}
              />
            </Card>
            <Card>
              <Stat
                label="This week"
                value={
                  <>
                    {data.thisWeek.posted} <small>/ {data.thisWeek.planned} posted</small>
                  </>
                }
              >
                <ul className="home-plats" aria-label="Posted this week per platform">
                  {PLATFORMS.map((p) => (
                    <li key={p}>
                      <span>{PLATFORM_LABEL[p].split(" ")[0]}</span>
                      <span className="nums">
                        {data.thisWeek.perPlatform[p].posted} / {data.thisWeek.perPlatform[p].cap}
                      </span>
                    </li>
                  ))}
                </ul>
              </Stat>
            </Card>
            <Card to={data.health.length === 0 ? "/settings/connections" : "/settings"}>
              <div className="card-label">Health</div>
              {data.health.length === 0 ? (
                <>
                  <div className="hint">Nothing connected yet</div>
                  <strong className="home-go">
                    Connect your accounts <Icon name="arrow" size="sm" />
                  </strong>
                </>
              ) : (
                <ul className="home-health">
                  {foldHealth(data.health)
                    .slice(0, 5)
                    .map((h) => (
                      <li key={h.name}>
                        <Dot light={h.light} />
                        <span className="truncate">{h.label}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
            <div className="card home-voice" data-voice={data.voice.state}>
              <div className="card-label">Your voice overs</div>
              <div className={`home-voice-line${data.voice.state === "problem" ? " bad" : ""}`}>
                {data.voice.state === "problem" ? <Dot light="red" /> : null}
                <span>{data.voice.line}</span>
              </div>
              <Link to={data.voice.link.to} className="home-go">
                {data.voice.link.label} <Icon name="arrow" size="sm" />
              </Link>
            </div>
          </div>

          {(data.youtube ?? []).length ? (
            <section className="section home-youtube" aria-label="Your YouTube videos">
              {data.youtube.map((y) => (
                <Notice key={`${y.kind}-${y.clip_id}`} tone={y.kind === "removal_soon" ? "warn" : "info"}>
                  <div className="home-yt" data-youtube-card={y.kind}>
                    {y.kind === "finish_in_studio" ? (
                      <>
                        <strong>Finish “{y.title}” in YouTube Studio.</strong> Set the thumbnail you picked and add your tags there (Buffer can't send those two).{" "}
                        <span className="btn-row">
                          {y.thumbnail_url ? (
                            <a className="btn quiet small" href={y.thumbnail_url} download>
                              Download thumbnail
                            </a>
                          ) : null}
                          <a className="btn small" href={y.studio_url} target="_blank" rel="noreferrer">
                            Open YouTube Studio
                          </a>
                          <Link className="btn quiet small" to="/review?tab=approved">
                            Copy the tags in Review
                          </Link>
                        </span>
                      </>
                    ) : y.kind === "upload_yourself" ? (
                      <>
                        <strong>Buffer couldn't take “{y.title}”.</strong> Download it and upload it on YouTube yourself; we mark it posted when it shows on your channel.{" "}
                        <span className="btn-row">
                          {y.download_url ? (
                            <a className="btn small" href={y.download_url} download>
                              Download for YouTube
                            </a>
                          ) : null}
                          <a className="btn quiet small" href={y.studio_url} target="_blank" rel="noreferrer">
                            Open YouTube upload
                          </a>
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>“{y.title}” is removed on {fmtDate(y.delete_on!)}</strong> unless you approve it: unapproved full videos are kept 14 days to save space.{" "}
                        <Link to="/review">Review it now</Link>
                      </>
                    )}
                  </div>
                </Notice>
              ))}
            </section>
          ) : null}

          <div className="split">
            <section className="section">
              <div className="section-head">
                <h2>Recent dumps</h2>
                <Link to="/dump">
                  All dumps <Icon name="arrow" size="sm" />
                </Link>
              </div>
              {data.recentDumps.length === 0 ? (
                <Empty title="No dumps yet" cta={{ to: "/dump", label: "Dump your first videos" }}>
                  Drop in phone footage or old videos. The cutter turns them into short clips for you to approve.
                </Empty>
              ) : (
                <Card className="flat">
                  <div className="list">
                    {data.recentDumps.map((d) => {
                      const s = DUMP_STATUS[d.status];
                      return (
                        <Link key={d.id} to={d.status === "ready" ? "/review" : `/dump/${d.id}`} className="list-row">
                          <div className="grow">
                            <div className="title">
                              {fmtDate(d.created_at)} · {d.door === "new" ? "New footage" : "Recycle"} · {plural(d.files, "video")}
                            </div>
                            <div className="meta">
                              {d.clips_made ? `${plural(d.clips_made, "clip")} made` : d.progress ? `${d.progress.step} · ${d.progress.done}/${d.progress.total}` : d.notes ? d.notes.slice(0, 80) : "No notes"}
                            </div>
                          </div>
                          <span className={`pill ${s.tone}`}>{s.text}</span>
                        </Link>
                      );
                    })}
                  </div>
                </Card>
              )}
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Follow-ups</h2>
                <Link to="/deals">
                  Deals <Icon name="arrow" size="sm" />
                </Link>
              </div>
              {data.followups.length === 0 ? (
                <Empty title="No follow-ups due" secondary={{ to: "/deals", label: "Open Deals" }}>
                  Pitches you send from Deals show up here on day 5, 12 and 19, so no brand goes quiet on you.
                </Empty>
              ) : (
                <Card className="flat">
                  <div className="list">
                    {data.followups.map((f) => (
                      <Link key={f.dealId} to={`/deals?deal=${f.dealId}`} className="list-row">
                        <div className="grow">
                          <div className="title">{f.brand}</div>
                          <div className="meta">{f.what} · {fmtDate(f.dueAt)}</div>
                        </div>
                        <span className="pill warn">Due</span>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </section>
          </div>
        </>
      ) : null}
      <HelpButton guide="what-runway-means" />
    </div>
  );
}
