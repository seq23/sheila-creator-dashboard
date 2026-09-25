// Connect accounts (section 4b): Buffer (paste key → channels found), stats (Instagram and
// Google sign-in via /api/oauth, TikTok export upload on Stats), AI (OpenRouter), web research (Firecrawl),
// Hunter (optional). Every connection has Connect / Check again / Disconnect, plus
// Disconnect everything. She always logs in on the platform's own page.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ConnectionView } from "@shared/types";
import { get, post } from "../lib/api";
import { ago } from "../lib/format";
import { Card, Dot, HelpButton, Modal, Notice, PageHead, Skeleton, useLoad, useToast } from "../components/ui";
import { useApp } from "../state";
import { PLATFORM_LABEL, type Platform } from "@shared/constants";

type Service = ConnectionView["service"];

const KEY_SERVICES: { service: Service; title: string; why: string; steps: string[]; guide: string; optional?: boolean }[] = [
  { service: "buffer", title: "Posting · Buffer", why: "Buffer publishes your clips to TikTok, Instagram and YouTube.", steps: ["Open Buffer → Settings → API", "Click Create key, then copy it", "Paste it here"], guide: "connect-buffer" },
  { service: "openrouter", title: "AI · OpenRouter", why: "Writes captions, hooks, your Research Brief and pitch drafts. Free models by default.", steps: ["Open openrouter.ai → Keys", "Create key, copy it", "Paste it here"], guide: "connect-openrouter" },
  { service: "firecrawl", title: "Web research · Firecrawl", why: "Searches the web for your Research Brief and brand finder. 1,000 free credits a month.", steps: ["Open firecrawl.dev → API Keys", "Copy your key", "Paste it here"], guide: "connect-firecrawl" },
  { service: "hunter", title: "Brand deals · Hunter.io", why: "Finds public partnership emails on brand websites. Free account: 50 lookups a month.", steps: ["Create a free Hunter account", "Open API → copy key", "Paste it here"], guide: "connect-hunter", optional: true },
];

export function Connect() {
  const { me } = useApp();
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => get<ConnectionView[]>("/api/connections"));
  const [confirmAll, setConfirmAll] = useState(false);
  const [params, setParams] = useSearchParams();
  const oauthNote = oauthMessage(params);
  const byService = (s: Service) => data?.find((c) => c.service === s) ?? null;
  const owner = me?.role === "owner";

  async function disconnectAll() {
    try {
      await post("/api/connections/disconnect-all");
      toast.ok("Everything disconnected. Nothing will post until you reconnect Buffer.");
      setConfirmAll(false);
      reload();
    } catch (e) {
      toast.bad(e);
    }
  }

  return (
    <div className="page">
      <PageHead
        crumb={
          <>
            <Link to="/settings">Settings</Link> › Connections
          </>
        }
        title="Connect your accounts"
      >
        {owner ? (
          <button className="btn danger" onClick={() => setConfirmAll(true)}>
            Disconnect everything
          </button>
        ) : null}
      </PageHead>
      <Notice tone="info">
        <span>You always log in on TikTok, Instagram, Google or Buffer's own page. We never see your passwords. Keys are stored encrypted in your Cloudflare account.</span>
      </Notice>

      {oauthNote ? (
        <Notice tone={oauthNote.ok ? "ok" : "bad"}>
          <span>
            {oauthNote.text} {oauthNote.guide ? <Link to={`/help/${oauthNote.guide}`}>How to fix</Link> : null}{" "}
            <button className="btn quiet small" onClick={() => setParams({}, { replace: true })}>
              OK
            </button>
          </span>
        </Notice>
      ) : null}

      {loading && !data ? <Skeleton lines={5} /> : null}

      {data ? (
        <>
          <Section n={1} title={KEY_SERVICES[0].title}>
            <KeyCard def={KEY_SERVICES[0]} conn={byService("buffer")} owner={owner} onChange={reload} />
            <ChannelsCard conn={byService("buffer")} />
          </Section>

          <Section n={2} title="Stats · for research">
            <Card className="flat">
              <div className="hint">Lets the dashboard learn what works for you. Read-only; it can't post.</div>
              <div className="list">
                <StatsRow name="Instagram" provider="meta" conn={byService("meta")} connectLabel="Connect with Instagram" owner={owner} onChange={reload} />
                <StatsRow name="YouTube" provider="google" conn={byService("google")} connectLabel="Connect with Google" owner={owner} onChange={reload} />
                <TikTokRow conn={byService("tiktok")} />
              </div>
              <div className="hint">TikTok stats: direct connect only if TikTok approves the app. Until then, upload the export from TikTok Studio once a month.</div>
            </Card>
          </Section>

          <Section n={3} title="AI and research">
            <div className="grid cols-2">
              <KeyCard def={KEY_SERVICES[1]} conn={byService("openrouter")} owner={owner} onChange={reload} />
              <KeyCard def={KEY_SERVICES[2]} conn={byService("firecrawl")} owner={owner} onChange={reload} />
            </div>
          </Section>

          <Section n={4} title="Brand deals · optional">
            <KeyCard def={KEY_SERVICES[3]} conn={byService("hunter")} owner={owner} onChange={reload} />
          </Section>
        </>
      ) : null}

      {confirmAll ? (
        <Modal title="Disconnect everything?" onClose={() => setConfirmAll(false)}>
          <p>Every key is removed. Nothing posts until you reconnect Buffer. Your clips and calendar are kept.</p>
          <div className="btn-row">
            <button className="btn danger" onClick={disconnectAll}>
              Yes, disconnect everything
            </button>
            <button className="btn quiet" onClick={() => setConfirmAll(false)}>
              Keep them
            </button>
          </div>
        </Modal>
      ) : null}
      <HelpButton guide="connect-buffer" />
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="row">
        <span className="step-num">{n}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusPill({ conn }: { conn: ConnectionView | null }) {
  const status = conn?.status ?? "missing";
  const light = status === "ok" ? "green" : status === "error" ? "red" : "grey";
  const text = status === "ok" ? `Connected${conn?.last_ok_at ? ` · checked ${ago(conn.last_ok_at)}` : ""}` : status === "error" ? (conn?.last_error ?? "Needs you") : status === "disconnected" ? "Disconnected" : "Not connected";
  return (
    <span className="row" style={{ gap: 8, fontSize: "0.9rem" }}>
      <Dot light={light} />
      {text}
    </span>
  );
}

function KeyCard({ def, conn, owner, onChange }: { def: (typeof KEY_SERVICES)[number]; conn: ConnectionView | null; owner: boolean; onChange: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = conn?.status === "ok";
  const credits = conn?.meta.credits_left as number | undefined;

  async function check() {
    setBusy(true);
    try {
      await post(`/api/connections/${def.service}/key`, { key });
      toast.ok(`${def.title.split(" · ")[1] ?? def.title} connected.`);
      setKey("");
      onChange();
    } catch (e) {
      toast.bad(e);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function recheck() {
    setBusy(true);
    try {
      await post(`/api/connections/${def.service}/recheck`);
      toast.ok("Still working.");
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(false);
      onChange();
    }
  }
  async function disconnect() {
    try {
      await post(`/api/connections/${def.service}/disconnect`);
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }

  return (
    <Card>
      <div className="row between wrap">
        <h3>{def.title}</h3>
        <StatusPill conn={conn} />
      </div>
      <p className="soft">{def.why}</p>
      {credits !== undefined ? (
        <div className="hint">
          {credits} of {(conn?.meta.credits_total as number | undefined) ?? "your"} credits left this month
        </div>
      ) : null}
      {!connected ? (
        <>
          <div>
            <div className="label">How to connect (2 minutes)</div>
            <ol style={{ margin: "6px 0 0", paddingLeft: 20 }} className="soft">
              {def.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="row wrap">
            <input className="input" type="password" aria-label={`${def.title} key`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" style={{ flex: 1, minWidth: 200 }} disabled={!owner} />
            <button className="btn" onClick={check} disabled={!owner || busy || key.length < 8}>
              {busy ? "Checking…" : "Check key"}
            </button>
          </div>
          <Link to={`/help/${def.guide}`} className="hint">
            Picture-by-picture guide
          </Link>
        </>
      ) : (
        <div className="btn-row">
          <button className="btn quiet small" onClick={recheck} disabled={busy}>
            Check again
          </button>
          {owner ? (
            <button className="btn danger small" onClick={disconnect}>
              Disconnect
            </button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ChannelsCard({ conn }: { conn: ConnectionView | null }) {
  if (conn?.status !== "ok") return null;
  const channels = (conn.meta.channels as { platform: Platform; handle: string; connected: boolean }[] | undefined) ?? [];
  const missing = (["tiktok", "instagram", "youtube"] as Platform[]).filter((p) => !channels.some((c) => c.platform === p));
  return (
    <Card className="flat">
      <div className="label">Channels we found in your Buffer</div>
      <div className="list">
        {channels.map((ch) => (
          <div key={ch.platform} className="list-row">
            <Dot light={ch.connected ? "green" : "red"} />
            <div className="grow">
              <div className="title">{PLATFORM_LABEL[ch.platform]}</div>
              <div className="meta">{ch.connected ? `${ch.handle} · posting OK` : "Needs reconnect in Buffer"}</div>
            </div>
            {!ch.connected ? (
              <a className="btn quiet small" href="https://publish.buffer.com/channels" target="_blank" rel="noreferrer">
                Open Buffer to reconnect
              </a>
            ) : null}
          </div>
        ))}
        {missing.map((p) => (
          <div key={p} className="list-row">
            <Dot light="red" />
            <div className="grow">
              <div className="title">{PLATFORM_LABEL[p]}</div>
              <div className="meta">Not added in Buffer yet</div>
            </div>
            <a className="btn quiet small" href="https://publish.buffer.com/channels/connect" target="_blank" rel="noreferrer">
              Open Buffer to add it
            </a>
          </div>
        ))}
      </div>
      <Link to="/help/add-channels-in-buffer" className="hint">
        How to add TikTok, Instagram and YouTube in Buffer
      </Link>
    </Card>
  );
}

const OAUTH_ERRORS: Record<string, string> = {
  not_set_up: "stats sign-in is not set up on this dashboard yet (the app keys are missing).",
  denied: "the sign-in was cancelled, so nothing was connected.",
  expired: "the sign-in took too long. Press Connect again.",
  no_account: "that account has no Professional Instagram or YouTube channel to read.",
  failed: "the connection did not finish. Press Connect again.",
};

/** The redirect back from /api/oauth/<provider>/callback carries ?connected= or ?oauth_error=. */
function oauthMessage(params: URLSearchParams): { ok: boolean; text: string; guide: string | null } | null {
  const who = (p: string | null) => (p === "google" ? "YouTube" : "Instagram");
  const connected = params.get("connected");
  if (connected === "meta" || connected === "google") return { ok: true, text: `${who(connected)} stats connected. We'll read your results every week.`, guide: null };
  const err = params.get("oauth_error");
  if (!err) return null;
  const provider = params.get("provider") === "google" ? "google" : "meta";
  return { ok: false, text: `${who(provider)}: ${OAUTH_ERRORS[err] ?? OAUTH_ERRORS.failed}`, guide: `connect-${provider}` };
}

function StatsRow({ name, provider, conn, connectLabel, owner, onChange }: { name: string; provider: "meta" | "google"; conn: ConnectionView | null; connectLabel: string; owner: boolean; onChange: () => void }) {
  const toast = useToast();
  const status = conn?.status ?? "missing";
  const account = conn?.meta.account as string | undefined;
  const synced = (conn?.meta.last_sync_at as string | null | undefined) ?? null;
  const start = `/api/oauth/${provider}/start`;
  async function disconnect() {
    try {
      await post(`/api/connections/${provider}/disconnect`);
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }
  return (
    <div className="list-row" style={{ flexWrap: "wrap" }}>
      <Dot light={status === "ok" ? "green" : status === "error" ? "red" : "grey"} />
      <div className="grow">
        <div className="title">{name}</div>
        <div className="meta">
          {status === "ok"
            ? `${account ? `${account} · ` : ""}${synced ? `Last synced ${ago(synced)}` : "Connected · first sync this week"}`
            : status === "error"
              ? (conn?.last_error ?? "Needs reconnect")
              : "Not connected"}
        </div>
      </div>
      {owner ? (
        status === "ok" || status === "error" ? (
          <>
            <a className="btn quiet small" href={start}>
              Reconnect
            </a>
            <button className="btn danger small" onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <a className="btn small" href={start}>
            {connectLabel}
          </a>
        )
      ) : null}
    </div>
  );
}

function TikTokRow({ conn }: { conn: ConnectionView | null }) {
  const imported = conn?.meta.last_import_at as string | undefined;
  return (
    <div className="list-row">
      <Dot light={imported ? "green" : "grey"} />
      <div className="grow">
        <div className="title">TikTok</div>
        <div className="meta">{imported ? `Last import ${ago(imported)}` : "No export uploaded yet"}</div>
      </div>
      <Link className="btn quiet small" to="/stats">
        Upload TikTok export
      </Link>
    </div>
  );
}
