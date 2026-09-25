// Brand deals (section 12b): brand cards with fit reasons and links, the public contact and the
// page it was found on, pitch drafts she edits and sends herself (Open in Gmail / Copy / Open
// form; the dashboard never sends), the deal tracker with follow-ups, deliverables on won deals,
// TikTok One eligibility, and her media kit (second tab).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BrandCard, PitchView } from "@shared/types";
import { DEAL_STAGES, PLATFORMS, PLATFORM_LABEL, type DealStage, type Platform } from "@shared/constants";
import { del, get, patch, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { gmailComposeUrl, pitchAsText } from "../lib/gmail";
import { Card, Empty, HelpButton, Modal, Notice, PageHead, Skeleton, useLoad, useToast } from "../components/ui";
import { MediaKitEditor } from "./MediaKit";
import "../styles/deals.css";

interface Deliverable {
  id: string;
  clip_id: string | null;
  platform: Platform;
  due_at: string;
  note: string;
  done: boolean;
}
type Card2 = BrandCard & { deal_detail: { terms_note: string; deliverables: Deliverable[]; paid_partnership: boolean } | null };
interface DealsData {
  brands: Card2[];
  stages: Record<DealStage, number>;
  marketplace: { marketplace: string; eligible: boolean; hasData: boolean; summary: string; checks: { label: string; have: number | null; need: number; ok: boolean }[] };
  kit_url: string;
  kit_path: string;
  profile_locked: boolean;
  finder: { status: string; started_at: string | null; finished_at: string | null; running: boolean; error: string | null };
  hunter: { connected: boolean; credits_left: number | null };
}

const STAGE_LABEL: Record<DealStage, string> = { found: "Found", drafted: "Drafted", sent: "Sent", replied: "Replied", negotiating: "Negotiating", won: "Won", passed: "Passed" };
const CONTACT_LABEL = { form: "Application form", role_email: "Email", agency: "Their agency" } as const;

export function Deals() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "kit" ? "kit" : "brands";
  const [showHidden, setShowHidden] = useState(false);
  const { data, loading, error, reload } = useLoad(() => get<DealsData>(`/api/deals${showHidden ? "?hidden=1" : ""}`), [showHidden]);
  const [selected, setSelected] = useState<string | null>(params.get("brand"));
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const brands = data?.brands ?? [];
  const current = brands.find((b) => b.id === selected) ?? null;

  // While the finder runs, check back every 15 seconds.
  useEffect(() => {
    if (!data?.finder.running) return;
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [data?.finder.running, reload]);

  async function runFinder() {
    try {
      await post("/api/deals/finder/run");
      toast.ok("Looking for brands. New cards show up here in a few minutes.");
      reload();
    } catch (e) {
      toast.bad(e);
    }
  }

  function pick(id: string | null) {
    setSelected(id);
    const next = new URLSearchParams(params);
    if (id) next.set("brand", id);
    else next.delete("brand");
    setParams(next, { replace: true });
  }

  const suggestedCount = brands.filter((b) => b.status !== "hidden").length;

  return (
    <div className="page deals">
      <PageHead title="Brand deals">
        {data ? (
          <a className="btn quiet" href={data.kit_path} target="_blank" rel="noreferrer">
            View my media kit
          </a>
        ) : null}
        <button type="button" className="btn quiet" onClick={() => setAdding(true)}>
          + Add a brand I love
        </button>
      </PageHead>

      <div className="deals-tabs" role="tablist" aria-label="Deals sections">
        <button type="button" role="tab" aria-selected={tab === "brands"} className={tab === "brands" ? "on" : ""} onClick={() => setParams({}, { replace: true })}>
          Brands
        </button>
        <button type="button" role="tab" aria-selected={tab === "kit"} className={tab === "kit" ? "on" : ""} onClick={() => setParams({ tab: "kit" }, { replace: true })}>
          Media kit
        </button>
      </div>

      {tab === "kit" ? (
        <MediaKitEditor />
      ) : (
        <>
          {loading && !data ? <Skeleton lines={5} /> : null}
          {error ? <Notice tone="bad">Brand deals did not load. Check your connection and try again.</Notice> : null}
          {data ? (
            <>
              {!data.profile_locked ? (
                <Notice tone="info">
                  <span>
                    <strong>Lock your Brand Profile first.</strong> The finder and your pitches read it. <Link to="/brain">Open Client Brain</Link>
                  </span>
                </Notice>
              ) : null}

              <div className="stage-strip" aria-label="Deal stages">
                {DEAL_STAGES.filter((s) => s !== "passed").map((s) => (
                  <div key={s} className={`stage${data.stages[s] ? " has" : ""}`}>
                    <span>{STAGE_LABEL[s]}</span>
                    <strong>{data.stages[s]}</strong>
                  </div>
                ))}
              </div>

              <Marketplace m={data.marketplace} />

              <div className="deals-split">
                <section className={`brand-list${current ? " has-current" : ""}`} aria-label="Brands">
                  <div className="section-head">
                    <h2>Suggested this week · {suggestedCount} brands</h2>
                  </div>
                  <div className="finder-bar">
                    <button type="button" className="btn" onClick={runFinder} disabled={data.finder.running || !data.profile_locked}>
                      {data.finder.running ? "Looking for brands…" : "Find brands now"}
                    </button>
                    <span className="hint">
                      {data.finder.finished_at ? `Last search ${fmtDate(data.finder.finished_at)}` : data.finder.running ? "This takes a few minutes." : "Runs every Monday on its own."}
                      {data.hunter.connected ? ` · Hunter: ${data.hunter.credits_left ?? "?"} lookups left` : ""}
                    </span>
                  </div>
                  {data.finder.status === "failed" ? (
                    <Notice tone="bad">
                      <span>
                        The last brand search did not finish. <Link to="/help/reconnect-firecrawl">How to fix</Link>
                      </span>
                    </Notice>
                  ) : null}
                  {brands.length === 0 ? (
                    <Empty title="No brands yet">Press Find brands now, or add a brand you already use and love. Those make the strongest pitches.</Empty>
                  ) : (
                    brands.map((b) => (
                      <button key={b.id} type="button" className={`brand-card${b.id === selected ? " on" : ""}${b.status === "hidden" ? " hidden-brand" : ""}`} onClick={() => pick(b.id)} aria-pressed={b.id === selected}>
                        <span className="brand-top">
                          <span className="brand-logo" aria-hidden="true">
                            {b.name.slice(0, 1)}
                          </span>
                          <span className="brand-name">{b.name}</span>
                          {b.deal && b.deal.stage !== "found" ? <span className="pill">{STAGE_LABEL[b.deal.stage]}</span> : null}
                          <span className="pill ok">Fit {Math.round(b.fit_score * 100)}</span>
                        </span>
                        <span className="brand-why">{b.origin === "her_list" ? "You listed it as a brand you use" : b.why_now ?? b.fit_reasons.slice(0, 2).join(" · ")}</span>
                        {b.deal?.next_followup_at && new Date(b.deal.next_followup_at).getTime() <= Date.now() + 86400_000 ? <span className="pill warn">Follow-up due {fmtDate(b.deal.next_followup_at)}</span> : null}
                      </button>
                    ))
                  )}
                  <label className="switch-line">
                    <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show brands I hid
                  </label>
                </section>

                <section className="brand-detail" aria-label="Brand">
                  {current ? (
                    <BrandDetail key={current.id} b={current} kitUrl={data.kit_url} onChange={reload} onBack={() => pick(null)} />
                  ) : (
                    <Card className="flat pick-hint">
                      <p className="soft">Pick a brand to see why it fits, who to contact and your pitch.</p>
                    </Card>
                  )}
                </section>
              </div>
            </>
          ) : null}
        </>
      )}

      {adding ? (
        <AddBrand
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setParams({ brand: id }, { replace: true });
            setSelected(id);
            reload();
          }}
        />
      ) : null}
      <HelpButton guide="send-a-pitch" />
    </div>
  );
}

function Marketplace({ m }: { m: DealsData["marketplace"] }) {
  return (
    <Card className={`flat marketplace${m.eligible ? " ok" : ""}`}>
      <div className="row between wrap">
        <div>
          <div className="card-label">{m.marketplace}</div>
          <div>{m.summary}</div>
        </div>
        {m.hasData ? (
          <div className="mk-checks">
            {m.checks.map((c) => (
              <span key={c.label} className={`pill ${c.ok ? "ok" : ""}`} title={`${c.label}: ${c.have ?? 0} of ${c.need}`}>
                {c.ok ? "✓" : "·"} {c.label}
              </span>
            ))}
          </div>
        ) : (
          <Link className="btn quiet small" to="/settings/connections">
            Connect stats
          </Link>
        )}
      </div>
    </Card>
  );
}

function BrandDetail({ b, kitUrl, onChange, onBack }: { b: Card2; kitUrl: string; onChange: () => void; onBack: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [contactId, setContactId] = useState<string | null>(b.pitch?.contact_id ?? b.contacts[0]?.id ?? null);
  const [part, setPart] = useState<"email" | "dm" | "f1" | "f2">("email");
  const [draft, setDraft] = useState<PitchView | null>(b.pitch);
  const [sending, setSending] = useState(false);
  const [addContact, setAddContact] = useState(false);
  const contact = b.contacts.find((x) => x.id === contactId) ?? b.contacts[0] ?? null;
  const top = useRef<HTMLDivElement>(null);
  // Phone: the list gives way to the brand she opened; bring it into view.
  useEffect(() => {
    if (window.innerWidth < 900) top.current?.scrollIntoView({ block: "start" });
  }, []);
  // A reload (sent, replied, redrafted) brings the saved pitch back; take it.
  const pitchSig = b.pitch ? `${b.pitch.id}|${b.pitch.status}|${b.pitch.next_followup_at}|${b.pitch.subject}|${b.pitch.body.length}` : "";
  useEffect(() => setDraft(b.pitch), [pitchSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = b.deal?.stage ?? "found";

  async function draftPitch() {
    setBusy(true);
    try {
      const r = await post<{ pitch: PitchView; note: string | null }>(`/api/deals/brands/${b.id}/pitch`, { contact_id: contact?.id });
      setDraft(r.pitch);
      if (r.note) toast.ok(r.note);
      onChange();
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveField(k: keyof Pick<PitchView, "subject" | "body" | "dm_text" | "followup_1" | "followup_2">, v: string) {
    if (!draft || draft[k] === v) return;
    setDraft({ ...draft, [k]: v });
    try {
      await patch(`/api/deals/pitches/${draft.id}`, { [k]: v });
    } catch (e) {
      toast.bad(e);
    }
  }

  async function hide() {
    try {
      await patch(`/api/deals/brands/${b.id}`, { status: b.status === "hidden" ? "suggested" : "hidden" });
      toast.ok(b.status === "hidden" ? "Back in your list." : "Hidden. It won't be suggested again.");
      onBack();
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }

  async function act(path: string, body: unknown, ok: string) {
    try {
      await post(path, body);
      toast.ok(ok);
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }

  const text = draft ? { email: draft.body, dm: draft.dm_text, f1: draft.followup_1, f2: draft.followup_2 }[part] : "";
  const subject = draft ? (part === "email" ? draft.subject : part === "dm" ? "" : `Re: ${draft.subject}`) : "";
  const emailTo = contact && contact.kind !== "form" && contact.value.includes("@") ? contact.value : null;
  const gmail = draft && emailTo && part !== "dm" ? gmailComposeUrl(emailTo, subject, text) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(part === "dm" ? text : pitchAsText(subject, text));
      toast.ok("Copied. Paste it wherever you're sending it.");
    } catch {
      toast.bad(new Error("Your browser blocked copying. Select the text and copy it by hand."));
    }
  }

  return (
    <Card accent className="detail">
      <div ref={top} />
      <button type="button" className="btn quiet small back-btn" onClick={onBack}>
        ‹ All brands
      </button>
      <div className="row between wrap detail-head">
        <h2>{b.name}</h2>
        <div className="row wrap links">
          {b.website ? (
            <a href={b.website} target="_blank" rel="noreferrer">
              Website
            </a>
          ) : null}
          {b.program_url ? (
            <a href={b.program_url} target="_blank" rel="noreferrer">
              Creator program
            </a>
          ) : null}
          {Object.entries(b.socials).map(([k, v]) => (
            <a key={k} href={v} target="_blank" rel="noreferrer">
              Their {k === "tiktok" ? "TikTok" : k === "instagram" ? "Instagram" : k === "youtube" ? "YouTube" : k}
            </a>
          ))}
        </div>
      </div>

      <div className="why">
        <div>
          <strong>Why it fits:</strong> {b.fit_reasons.length ? `${b.fit_reasons.map((r) => r.replace(/\.$/, "")).join("; ")}.` : "You added it."}
        </div>
        {b.why_now ? (
          <div>
            <strong>Why now:</strong> {b.why_now.replace(/\.$/, "")}.
          </div>
        ) : null}
        {b.contacts.length ? (
          <div className="contact-line">
            <strong>Contact:</strong>{" "}
            {b.contacts.length > 1 ? (
              <select className="select inline" aria-label="Contact" value={contact?.id ?? ""} onChange={(e) => setContactId(e.target.value)}>
                {b.contacts.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {CONTACT_LABEL[ct.kind]}: {ct.value}
                  </option>
                ))}
              </select>
            ) : (
              <span className="mono">{contact!.value}</span>
            )}{" "}
            · found on{" "}
            <a href={contact!.found_on_url} target="_blank" rel="noreferrer">
              {hostOf(contact!.found_on_url)}
            </a>
          </div>
        ) : (
          <div className="contact-line">
            <strong>Contact:</strong> none found yet. The finder only keeps public business contacts.{" "}
            <button type="button" className="linkish" onClick={() => setAddContact(true)}>
              Add one you found
            </button>
          </div>
        )}
        {b.source_links.length ? (
          <div className="hint">
            Sources:{" "}
            {b.source_links.map((s, i) => (
              <a key={s} href={s} target="_blank" rel="noreferrer">
                {i ? " · " : ""}
                {hostOf(s)}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {!draft ? (
        <div className="btn-row">
          <button type="button" className="btn big" onClick={draftPitch} disabled={busy}>
            {busy ? "Writing…" : "Draft a pitch"}
          </button>
          <button type="button" className="linkish" onClick={hide}>
            {b.status === "hidden" ? "Show it again" : "Not a fit — hide"}
          </button>
        </div>
      ) : (
        <>
          <div className="pitch-parts" role="tablist" aria-label="Pitch parts">
            {(
              [
                ["email", "Email"],
                ["dm", "DM"],
                ["f1", "Follow-up day 5"],
                ["f2", "Follow-up day 12"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={part === k} className={part === k ? "on" : ""} onClick={() => setPart(k)}>
                {label}
              </button>
            ))}
          </div>
          {part === "email" ? (
            <label className="field">
              <span className="label">Subject</span>
              <input className="input" defaultValue={draft.subject} key={`s-${draft.id}-${draft.subject}`} onBlur={(e) => saveField("subject", e.target.value)} disabled={draft.status !== "drafted"} />
            </label>
          ) : null}
          <label className="field">
            <span className="label">{part === "email" ? "Email" : part === "dm" ? "DM" : part === "f1" ? "Follow-up (day 5)" : "Follow-up (day 12)"}</span>
            <textarea
              className="textarea pitch-text"
              key={`${part}-${draft.id}`}
              defaultValue={text}
              onBlur={(e) => saveField(part === "email" ? "body" : part === "dm" ? "dm_text" : part === "f1" ? "followup_1" : "followup_2", e.target.value)}
            />
          </label>

          <div className="btn-row send-row">
            {contact?.kind === "form" && part === "email" ? (
              <a className="btn big" href={contact.value} target="_blank" rel="noreferrer" onClick={copy}>
                Open form
              </a>
            ) : gmail ? (
              <a className="btn big" href={gmail} target="_blank" rel="noreferrer">
                Open in Gmail
              </a>
            ) : null}
            <button type="button" className="btn quiet" onClick={copy}>
              Copy
            </button>
            {draft.status === "drafted" ? (
              <button type="button" className="btn quiet" onClick={() => setSending(true)}>
                Mark as sent
              </button>
            ) : null}
            {draft.status === "drafted" ? (
              <button type="button" className="linkish" onClick={draftPitch} disabled={busy}>
                {busy ? "Writing…" : "Redraft"}
              </button>
            ) : null}
            <span className="grow" />
            <button type="button" className="linkish" onClick={hide}>
              {b.status === "hidden" ? "Show it again" : "Not a fit — hide"}
            </button>
          </div>
          {contact?.kind === "form" && part === "email" ? <div className="hint">Open form copies your pitch too, so you can paste your answers.</div> : null}
          {!contact ? <div className="hint">No contact yet: use Copy, or send the DM version on their profile.</div> : null}

          <Tracker b={b} stage={stage} pitch={draft} onAct={act} onChange={onChange} />
        </>
      )}

      {sending && draft ? (
        <SentModal
          onClose={() => setSending(false)}
          onSent={async (sentAt) => {
            try {
              await post(`/api/deals/pitches/${draft.id}/sent`, { sent_at: sentAt });
              toast.ok("Marked as sent. We'll remind you to follow up on day 5.");
              setSending(false);
              onChange();
            } catch (e) {
              toast.bad(e);
            }
          }}
        />
      ) : null}
      {addContact ? <AddContact brandId={b.id} onClose={() => setAddContact(false)} onAdded={() => { setAddContact(false); onChange(); }} /> : null}
      <p className="hint kit-line">
        Your media kit link goes in every pitch: <span className="mono">{kitUrl}</span>
      </p>
    </Card>
  );
}

function Tracker({ b, stage, pitch, onAct, onChange }: { b: Card2; stage: DealStage; pitch: PitchView; onAct: (path: string, body: unknown, ok: string) => Promise<void>; onChange: () => void }) {
  const deal = b.deal;
  if (!deal) return null;
  const move = (to: DealStage, ok: string) => onAct(`/api/deals/deals/${deal.id}/stage`, { stage: to }, ok);
  return (
    <div className="tracker">
      <div className="tracker-head">
        <span className="pill">{STAGE_LABEL[stage]}</span>
        {pitch.sent_at ? <span className="hint">Sent {fmtDate(pitch.sent_at)}</span> : null}
        {pitch.next_followup_at ? <span className="pill warn">Follow up {fmtDate(pitch.next_followup_at)}</span> : null}
      </div>
      <div className="btn-row">
        {stage === "sent" ? (
          <>
            <button type="button" className="btn" onClick={() => onAct(`/api/deals/deals/${deal.id}/reply`, {}, "Nice! Follow-up reminders are off for this one.")}>
              They replied
            </button>
            {pitch.next_followup_at ? (
              <button type="button" className="btn quiet" onClick={() => onAct(`/api/deals/pitches/${pitch.id}/followup-sent`, {}, "Follow-up marked as sent.")}>
                I sent the follow-up
              </button>
            ) : null}
          </>
        ) : null}
        {stage === "replied" ? (
          <button type="button" className="btn" onClick={() => move("negotiating", "Moved to negotiating.")}>
            We're talking terms
          </button>
        ) : null}
        {stage === "replied" || stage === "negotiating" ? (
          <button type="button" className="btn quiet" onClick={() => move("won", "Won! Add what you owe them below.")}>
            We have a deal
          </button>
        ) : null}
        {stage !== "won" && stage !== "passed" && stage !== "found" ? (
          <button type="button" className="linkish" onClick={() => move("passed", "Closed. It won't be suggested again.")}>
            Pass on it
          </button>
        ) : null}
        {stage === "won" || stage === "passed" ? (
          <button type="button" className="linkish" onClick={() => move("negotiating", "Reopened.")}>
            Reopen
          </button>
        ) : null}
      </div>
      {stage === "won" && b.deal_detail ? <Deliverables dealId={deal.id} detail={b.deal_detail} onAct={onAct} onChange={onChange} /> : null}
    </div>
  );
}

function Deliverables({ dealId, detail, onAct, onChange }: { dealId: string; detail: NonNullable<Card2["deal_detail"]>; onAct: (path: string, body: unknown, ok: string) => Promise<void>; onChange: () => void }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  async function toggle(d: Deliverable) {
    try {
      await patch(`/api/deals/deals/${dealId}/deliverables/${d.id}`, { done: !d.done });
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }
  async function remove(d: Deliverable) {
    try {
      await del(`/api/deals/deals/${dealId}/deliverables/${d.id}`);
      toast.ok("Removed.");
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }
  return (
    <div className="deliverables">
      <h3>What you owe them</h3>
      <Notice tone="info">
        <span>
          Sponsored clips are flagged <strong>Paid partnership</strong> in Review: the caption gets #ad, and remember to switch on the platform's paid-partnership label when it posts. <Link to="/help/mark-a-paid-partnership">How</Link>
        </span>
      </Notice>
      {detail.deliverables.length ? (
        <div className="list">
          {detail.deliverables.map((d) => (
            <div key={d.id} className="list-row">
              <input type="checkbox" aria-label={`Done: ${PLATFORM_LABEL[d.platform]} due ${fmtDate(d.due_at)}`} checked={d.done} onChange={() => toggle(d)} />
              <div className="grow">
                <div className="title">
                  {PLATFORM_LABEL[d.platform]} · due {fmtDate(d.due_at)}
                </div>
                {d.note ? <div className="meta">{d.note}</div> : null}
              </div>
              <button type="button" className="linkish" onClick={() => remove(d)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="row wrap deliverable-add">
        <select className="select" aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
        <input className="input" type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <input className="input" aria-label="Note" placeholder="What they asked for" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={!due}
          onClick={async () => {
            await onAct(`/api/deals/deals/${dealId}/deliverables`, { platform, due_at: `${due}T17:00:00`, note }, "Added.");
            setDue("");
            setNote("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function SentModal({ onClose, onSent }: { onClose: () => void; onSent: (sentAt: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const min = useMemo(() => new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10), []);
  return (
    <Modal title="Mark as sent" onClose={onClose}>
      <p>We'll remind you to follow up on day 5 and day 12, on Home and in your Monday email.</p>
      <label className="field">
        <span className="label">When did you send it?</span>
        <input className="input" type="date" value={day} min={min} max={today} onChange={(e) => setDay(e.target.value)} />
      </label>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => onSent(day === today ? new Date().toISOString() : `${day}T12:00:00.000Z`)}>
          Yes, I sent it
        </button>
        <button type="button" className="btn quiet" onClick={onClose}>
          Not yet
        </button>
      </div>
    </Modal>
  );
}

function AddBrand({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [note, setNote] = useState("");
  async function save() {
    try {
      const r = await post<{ id: string; existed?: boolean }>("/api/deals/brands", { name, website: website || undefined, note: note || undefined });
      toast.ok(r.existed ? "Already in your list. Saved it to the top." : "Added. The finder looks up their public contact on its next run.");
      onAdded(r.id);
    } catch (e) {
      toast.bad(e);
    }
  }
  return (
    <Modal title="Add a brand you use and love" onClose={onClose}>
      <p className="soft">These make the strongest pitches.</p>
      <label className="field">
        <span className="label">Brand name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span className="label">Website (optional)</span>
        <input className="input" inputMode="url" placeholder="brand.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">What you love about it (optional)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="btn-row">
        <button type="button" className="btn" onClick={save} disabled={!name.trim()}>
          Add brand
        </button>
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function AddContact({ brandId, onClose, onAdded }: { brandId: string; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"role_email" | "form" | "agency">("role_email");
  const [value, setValue] = useState("");
  const [page, setPage] = useState("");
  async function save() {
    try {
      await post(`/api/deals/brands/${brandId}/contacts`, { kind, value, found_on_url: page });
      toast.ok("Contact added.");
      onAdded();
    } catch (e) {
      toast.bad(e);
    }
  }
  return (
    <Modal title="Add a public contact" onClose={onClose}>
      <p className="soft">Only business contacts the brand publishes, like partnerships@ or an application form. Never a personal address.</p>
      <label className="field">
        <span className="label">Type</span>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="role_email">Business email (partnerships@, pr@ …)</option>
          <option value="form">Application form link</option>
          <option value="agency">Their agency</option>
        </select>
      </label>
      <label className="field">
        <span className="label">{kind === "form" ? "Form link" : "Email"}</span>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">The page you found it on</span>
        <input className="input" inputMode="url" placeholder="https://brand.com/contact" value={page} onChange={(e) => setPage(e.target.value)} />
      </label>
      <div className="btn-row">
        <button type="button" className="btn" onClick={save} disabled={!value || !page}>
          Add contact
        </button>
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
