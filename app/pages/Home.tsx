import { Link } from "react-router-dom";
import type { HomeSummary } from "@shared/types";
import { get } from "../lib/api";
import { fmtDate, plural } from "../lib/format";
import { Card, Dot, Empty, HelpButton, Notice, PageHead, Skeleton, Stat, useLoad } from "../components/ui";
import { useApp } from "../state";
import { PLATFORM_LABEL, PLATFORMS } from "@shared/constants";

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
      <PageHead eyebrow={fmtDate(new Date().toISOString(), { weekday: "long", month: "short", day: "numeric" })} title={`Hi ${firstName}`}>
        <Link to="/dump" className="btn big">
          + Dump videos
        </Link>
      </PageHead>

      {loading && !data ? <Skeleton lines={4} /> : null}
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

          <div className="grid cols-4">
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
                    {data.thisWeek.posted} <small>/ {data.thisWeek.planned}</small>
                  </>
                }
                sub={`posted · ${PLATFORMS.map((p) => `${PLATFORM_LABEL[p].split(" ")[0]} ${data.thisWeek.perPlatform[p].posted}/${data.thisWeek.perPlatform[p].cap}`).join(" · ")}`}
              />
            </Card>
            <Card to="/review" accent={data.waiting.clips > 0}>
              <Stat label="Waiting for you" value={plural(data.waiting.clips, "clip")} sub={data.waiting.clips ? <strong style={{ color: "var(--rose)" }}>Review now →</strong> : data.waiting.dumpsCutting ? `${plural(data.waiting.dumpsCutting, "dump")} cutting` : "Nothing to review"} />
            </Card>
            <Card to="/settings">
              <div className="card-label">Health</div>
              {data.health.length === 0 ? (
                <div className="hint">Nothing connected yet</div>
              ) : (
                <div className="list">
                  {data.health.slice(0, 5).map((h) => (
                    <div key={h.name} className="row" style={{ padding: "5px 0", fontSize: "0.9rem" }}>
                      <Dot light={h.light} />
                      <span className="grow" style={{ flex: 1 }}>
                        {h.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="split">
            <section className="section">
              <div className="section-head">
                <h2>Recent dumps</h2>
                <Link to="/dump" className="soft">
                  All dumps
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
                        <Link key={d.id} to={d.status === "ready" ? "/review" : `/dump/${d.id}`} className="list-row" style={{ textDecoration: "none" }}>
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
                <Link to="/deals" className="soft">
                  Deals
                </Link>
              </div>
              {data.followups.length === 0 ? (
                <Card className="flat">
                  <div className="hint">No brand follow-ups due. Pitches you send show up here on day 5 and day 12.</div>
                </Card>
              ) : (
                <Card className="flat">
                  <div className="list">
                    {data.followups.map((f) => (
                      <Link key={f.dealId} to="/deals" className="list-row" style={{ textDecoration: "none" }}>
                        <div className="grow">
                          <div className="title">{f.brand}</div>
                          <div className="meta">Follow up {fmtDate(f.dueAt)}</div>
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
