// Settings (section 4): posting caps (max 10), times, audience time zone, runway threshold,
// emails, connections + Health panel, feature switches, help, helper login.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HealthItem, SettingsShape } from "@shared/types";
import { get, patch, post } from "../lib/api";
import { ago } from "../lib/format";
import { foldHealth } from "../lib/health";
import { Card, Dot, HelpButton, PageHead, Skeleton, Stepper, Switch, useLoad, useToast } from "../components/ui";
import { useApp } from "../state";
import { PLATFORMS, PLATFORM_LABEL } from "@shared/constants";

export function Settings() {
  const { me, refreshMe } = useApp();
  const toast = useToast();
  const s = useLoad(() => get<SettingsShape>("/api/settings"));
  const health = useLoad(() => get<HealthItem[]>("/api/settings/health"));
  const [draft, setDraft] = useState<SettingsShape | null>(null);
  const [emails, setEmails] = useState("");
  const [helper, setHelper] = useState("");
  const owner = me?.role === "owner";

  useEffect(() => {
    if (s.data) {
      setDraft(s.data);
      setEmails(s.data.notify_emails.join(", "));
      setHelper(s.data.helper_email ?? "");
    }
  }, [s.data]);

  async function save(partial: Partial<SettingsShape>) {
    try {
      const next = await patch<SettingsShape>("/api/settings", partial);
      setDraft(next);
      s.setData(next);
      if (partial.features) await refreshMe();
      toast.ok("Saved.");
    } catch (e) {
      toast.bad(e);
    }
  }

  if (!draft) return <Skeleton lines={6} />;
  const total = PLATFORMS.reduce((n, p) => n + draft.weekly_caps[p], 0);

  return (
    <div className="page">
      <PageHead title="Settings" />

      <section className="section">
        <h2>Posting</h2>
        <Card>
          {PLATFORMS.map((p) => (
            <div key={p} className="row between wrap" style={{ minHeight: 44 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{PLATFORM_LABEL[p]} per week</div>
                <div className="hint">max {draft.hard_cap_per_channel}</div>
              </div>
              <Stepper label={`${PLATFORM_LABEL[p]} posts per week`} value={draft.weekly_caps[p]} max={draft.hard_cap_per_channel} onChange={(n) => owner && save({ weekly_caps: { ...draft.weekly_caps, [p]: n } })} />
            </div>
          ))}
          <div className="hint">
            {total} posts a week from {Math.max(...PLATFORMS.map((p) => draft.weekly_caps[p]))} unique clips. Raise a platform only if its reach holds for two straight weeks.
          </div>
        </Card>
        <Card>
          <div className="row between wrap">
            <div>
              <div style={{ fontWeight: 600 }}>Posting times</div>
              <div className="hint">{draft.posting_slots_source === "research" ? "From your research brief (auto)" : "Custom"}</div>
            </div>
            <span className="pill">{draft.posting_slots_source === "research" ? "Auto" : "Custom"}</span>
          </div>
          <div className="row between wrap">
            <div>
              <div style={{ fontWeight: 600 }}>Audience time zone</div>
              <div className="hint">All posting times are in your audience's local time.</div>
            </div>
            <span className="mono">{draft.audience_timezone}</span>
          </div>
        </Card>
        <Card>
          <div className="row between wrap">
            <div>
              <div style={{ fontWeight: 600 }}>Email me when runway is under</div>
              <div className="hint">Runway = weeks of approved clips left.</div>
            </div>
            <div className="row">
              <Stepper label="weeks of runway" value={draft.runway_threshold_weeks} min={1} max={8} onChange={(n) => owner && save({ runway_threshold_weeks: n })} />
              <span>weeks</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="emails">Emails go to</label>
            <div className="row wrap">
              <input id="emails" className="input" value={emails} onChange={(e) => setEmails(e.target.value)} disabled={!owner} style={{ flex: 1, minWidth: 220 }} />
              <button className="btn quiet" disabled={!owner} onClick={() => save({ notify_emails: emails.split(/[,\s]+/).filter(Boolean) })}>
                Save
              </button>
            </div>
            <div className="hint">Separate several addresses with commas.</div>
          </div>
        </Card>
      </section>

      <HealthSection health={health.data} onChange={(rows) => health.setData(rows)} />

      <section className="section">
        <h2>Features</h2>
        <Card>
          <Switch label="Voice narration" hint="Shows the Voice tab. Clips stay real footage." checked={draft.features.voice} onChange={(v) => owner && save({ features: { ...draft.features, voice: v } })} />
          <Switch label="Deeper web research" hint="Perplexity search through OpenRouter, about $0.25 per brief. Off = free only." checked={draft.features.deeper_research} onChange={(v) => owner && save({ features: { ...draft.features, deeper_research: v } })} />
          <Switch label="Weekly recap email" hint="Monday: last week's top clip, runway, what's scheduled." checked={draft.features.weekly_recap} onChange={(v) => owner && save({ features: { ...draft.features, weekly_recap: v } })} />
        </Card>
        <Card>
          <div className="row between wrap">
            <div>
              <div style={{ fontWeight: 600 }}>Recycle wait per platform</div>
              <div className="hint">An old video never goes back to the same platform inside this window.</div>
            </div>
            <div className="row">
              <input className="input" type="number" min={30} max={365} value={draft.recycle_cooldown_days} disabled={!owner} onChange={(e) => setDraft({ ...draft, recycle_cooldown_days: Number(e.target.value) })} onBlur={() => owner && save({ recycle_cooldown_days: draft.recycle_cooldown_days })} style={{ width: 96 }} />
              <span>days</span>
            </div>
          </div>
        </Card>
      </section>

      <section className="section">
        <h2>Help + people</h2>
        <Card>
          <Link to="/help/getting-started" className="list-row" style={{ textDecoration: "none" }}>
            <div className="grow title">How the dashboard works (illustrated guide)</div>
            <span aria-hidden="true">→</span>
          </Link>
          <Link to="/help/reconnect-an-account" className="list-row" style={{ textDecoration: "none" }}>
            <div className="grow title">Fix a disconnected account</div>
            <span aria-hidden="true">→</span>
          </Link>
        </Card>
        <Card>
          <div className="field">
            <label htmlFor="helper">Helper login</label>
            <div className="hint">A second person who can log in to help. You can remove them any time.</div>
            <div className="row wrap">
              <input id="helper" className="input" type="email" value={helper} onChange={(e) => setHelper(e.target.value)} disabled={!owner} placeholder="helper@example.com" style={{ flex: 1, minWidth: 220 }} />
              <button className="btn quiet" disabled={!owner} onClick={() => save({ helper_email: helper.trim() || null })}>
                Save
              </button>
              {draft.helper_email ? (
                <button className="btn danger" disabled={!owner} onClick={() => save({ helper_email: null })}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </section>
      <HelpButton guide="change-posts-per-week" />
    </div>
  );
}

// ---------- Health (section 11): every light, plain names, a How to fix link on anything not green.
// The labels and the fold live in app/lib/health.ts, shared with Home's card.

function HealthSection({ health, onChange }: { health: HealthItem[] | null; onChange: (rows: HealthItem[]) => void }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const rows = foldHealth(health);
  const bad = rows.filter((r) => r.light === "red").length;

  async function recheck() {
    setChecking(true);
    try {
      onChange(await post<HealthItem[]>("/api/settings/health/recheck"));
      toast.ok("Checked everything.");
    } catch (e) {
      toast.bad(e);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="section" aria-label="Connections and health">
      <div className="section-head">
        <h2>Connections + health</h2>
        <div className="row wrap">
          <button className="btn quiet small" onClick={recheck} disabled={checking}>
            {checking ? "Checking…" : "Check everything now"}
          </button>
          <Link to="/settings/connections" className="btn dark small">
            Connect accounts
          </Link>
        </div>
      </div>
      {bad ? <div className="hint">{bad === 1 ? "One thing needs you." : `${bad} things need you.`} Each red light has a How to fix link.</div> : null}
      <Card className="flat">
        {rows.length > 0 ? (
          <div className="list">
            {rows.map((h) => (
              <div key={h.name} className="list-row" data-health={h.name}>
                <Dot light={h.light} />
                <div className="grow">
                  <div className="title">{h.label}</div>
                  <div className="meta">
                    {h.note} · checked {ago(h.checked_at)}
                  </div>
                </div>
                {h.fix_guide && h.light !== "green" ? (
                  <Link className="btn quiet small" to={`/help/${h.fix_guide}`}>
                    How to fix
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="hint">Nothing connected yet. Start with Buffer, then press Check everything now.</div>
        )}
      </Card>
    </section>
  );
}
