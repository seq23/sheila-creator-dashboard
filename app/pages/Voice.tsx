// Voice narration (section 12). Hidden until she switches it on in Settings (the sidebar item
// only shows when it is on; this page says so if opened directly). Step 1: record in the
// browser or upload a clip of just her voice, read the consent line, tick consent (owner only).
// Step 2: write a script or draft one from her profile, Generate, listen, download, attach.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { del, get, patch, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { uploadFile } from "../lib/upload";
import { Card, Empty, HelpButton, Modal, Notice, PageHead, Skeleton, useLoad, useToast } from "../components/ui";
import "../styles/voice.css";

interface VoiceState {
  enabled: boolean;
  hasSample: boolean;
  consent_at: string | null;
  consent_line: string;
  hasModel: boolean;
  owner: boolean;
  narrations: { id: string; script: string; status: "queued" | "generating" | "ready" | "failed"; clip_id: string | null; created_at: string; audio_url: string | null }[];
}

export function Voice() {
  const { data, loading, reload } = useLoad(() => get<VoiceState>("/api/voice"));
  const busy = data?.narrations.some((n) => n.status === "queued" || n.status === "generating");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [busy, reload]);

  return (
    <div className="page voice">
      <PageHead title="Voice narration" />
      {loading && !data ? <Skeleton lines={4} /> : null}
      {data && !data.enabled ? (
        <Empty title="Voice narration is off" cta={{ to: "/settings", label: "Open Settings" }}>
          Your clips stay real footage either way. Turn on Voice narration in Settings if you want spoken voice-overs in your own voice.
        </Empty>
      ) : null}
      {data && data.enabled ? (
        <>
          <SampleCard v={data} onChange={reload} />
          <NarrateCard v={data} onChange={reload} />
          <Narrations v={data} onChange={reload} />
        </>
      ) : null}
      <HelpButton guide="record-your-voice" />
    </div>
  );
}

function SampleCard({ v, onChange }: { v: VoiceState; onChange: () => void }) {
  const toast = useToast();
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const preview = clip ? URL.createObjectURL(clip) : null;
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.bad(new Error("This browser can't record here. Use Upload a clip instead."));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || "audio/webm";
        setClip(new File([new Blob(chunks, { type })], `voice-sample.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type }));
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.bad(new Error("The microphone is blocked. Allow it in your browser, or upload a clip instead."));
    }
  }
  function stop() {
    rec.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  }

  async function save() {
    if (!clip) return;
    setSaving(true);
    try {
      const h = await uploadFile(clip, "voice_sample", null, () => undefined);
      await post("/api/voice/sample", { upload_id: h.id, consent: true, consent_text: v.consent_line });
      toast.ok("Voice saved.");
      setClip(null);
      setConsent(false);
      onChange();
    } catch (e) {
      toast.bad(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await del("/api/voice/sample");
      toast.ok("Your voice sample and voice model are deleted.");
      setConfirmDelete(false);
      onChange();
    } catch (e) {
      toast.bad(e);
    }
  }

  return (
    <Card>
      <div className="row">
        <span className="step-num">1</span>
        <h2>Your voice (once)</h2>
      </div>
      {v.hasSample ? (
        <div className="row between wrap">
          <div className="row">
            <span className="dot green" /> Voice ready · saved {fmtDate(v.consent_at)}
          </div>
          {v.owner ? (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              Delete my voice
            </button>
          ) : null}
        </div>
      ) : null}
      {!v.owner ? (
        <Notice tone="info">Only Sheila's own login can record or replace the voice.</Notice>
      ) : (
        <>
          <p className="soft">
            {v.hasSample ? "To replace it, record again. " : ""}Record in a quiet room for 10 to 30 seconds, or upload a clip of just your voice. Read this aloud:
          </p>
          <blockquote className="consent-line">“{v.consent_line}”</blockquote>
          <div className="row wrap rec-row">
            <button type="button" className={`rec-btn${recording ? " on" : ""}`} aria-label={recording ? "Stop recording" : "Record sample"} onClick={recording ? stop : start}>
              <span />
            </button>
            <span className="soft">{recording ? `Recording… ${seconds}s` : clip ? "Recorded. Listen, then save." : "Tap to record"}</span>
            <label className="btn quiet">
              Upload a clip
              <input type="file" accept="audio/*,video/*" className="sr-only" aria-label="Upload a voice clip" onChange={(e) => setClip(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {preview ? <audio controls src={preview} className="voice-audio" /> : null}
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>This is my own voice and I consent to it being cloned for my narrations.</span>
          </label>
          <div className="btn-row">
            <button type="button" className="btn" onClick={save} disabled={!clip || !consent || saving}>
              {saving ? "Saving…" : "Save my voice"}
            </button>
          </div>
        </>
      )}
      {confirmDelete ? (
        <Modal title="Delete your voice?" onClose={() => setConfirmDelete(false)}>
          <p>Your voice sample and the voice model are deleted for good. Narrations you already made stay until you delete them.</p>
          <div className="btn-row">
            <button type="button" className="btn danger" onClick={remove}>
              Yes, delete my voice
            </button>
            <button type="button" className="btn quiet" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function NarrateCard({ v, onChange }: { v: VoiceState; onChange: () => void }) {
  const toast = useToast();
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState<"draft" | "gen" | null>(null);

  async function draft() {
    setBusy("draft");
    try {
      const r = await post<{ script: string; note: string | null }>("/api/voice/draft", {});
      setScript(r.script);
      if (r.note) toast.ok(r.note);
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(null);
    }
  }
  async function generate() {
    setBusy("gen");
    try {
      await post("/api/voice/narrations", { script });
      toast.ok("Generating. It shows up below when it's ready; short scripts take a few minutes.");
      setScript("");
      onChange();
    } catch (e) {
      toast.bad(e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card>
      <div className="row">
        <span className="step-num">2</span>
        <h2>Make a narration</h2>
      </div>
      {!v.hasSample ? <Notice tone="info">Save your voice in step 1 first.</Notice> : null}
      <label className="field">
        <span className="label">Script</span>
        <textarea className="textarea" rows={5} maxLength={1500} value={script} onChange={(e) => setScript(e.target.value)} placeholder="What should the voice-over say?" />
        <span className="hint">{script.length}/1500 · about {Math.max(1, Math.round(script.split(/\s+/).filter(Boolean).length / 2.5))} seconds</span>
      </label>
      <div className="btn-row">
        <button type="button" className="btn quiet" onClick={draft} disabled={!!busy}>
          {busy === "draft" ? "Drafting…" : "Draft with AI"}
        </button>
        <button type="button" className="btn" onClick={generate} disabled={!!busy || !v.hasSample || script.trim().length < 10}>
          {busy === "gen" ? "Starting…" : "Generate"}
        </button>
      </div>
    </Card>
  );
}

function Narrations({ v, onChange }: { v: VoiceState; onChange: () => void }) {
  const toast = useToast();
  const [attach, setAttach] = useState<string | null>(null);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Recent narrations</h2>
      </div>
      {v.narrations.length === 0 ? (
        <Card className="flat">
          <p className="hint">Narrations you generate show up here to listen to, download or attach to a clip.</p>
        </Card>
      ) : (
        <Card className="flat">
          <div className="list">
            {v.narrations.map((n) => (
              <div key={n.id} className="list-row narration">
                <div className="grow">
                  <div className="title">{n.script.slice(0, 80)}{n.script.length > 80 ? "…" : ""}</div>
                  <div className="meta">
                    {fmtDate(n.created_at)} · {n.status === "ready" ? (n.clip_id ? "Attached to a clip" : "Ready") : n.status === "failed" ? "Did not finish" : "Generating…"}
                  </div>
                  {n.audio_url ? <audio controls preload="none" src={n.audio_url} className="voice-audio" aria-label="Play narration" /> : null}
                </div>
                <div className="btn-row">
                  {n.audio_url ? (
                    <a className="btn quiet small" href={`${n.audio_url}?download=1`}>
                      Download
                    </a>
                  ) : null}
                  {n.audio_url ? (
                    <button type="button" className="btn quiet small" onClick={() => setAttach(n.id)}>
                      Attach to clip
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn quiet small"
                    onClick={() =>
                      del(`/api/voice/narrations/${n.id}`).then(
                        () => {
                          toast.ok("Deleted.");
                          onChange();
                        },
                        (e) => toast.bad(e),
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {attach ? <AttachModal narrationId={attach} onClose={() => setAttach(null)} onDone={onChange} /> : null}
    </section>
  );
}

function AttachModal({ narrationId, onClose, onDone }: { narrationId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data } = useLoad(() => get<{ clips: { id: string; hook_text: string }[] }>("/api/mediakit"));
  async function pick(clipId: string) {
    try {
      await patch(`/api/voice/narrations/${narrationId}`, { clip_id: clipId });
      toast.ok("Attached. You'll see it on the clip in Review.");
      onClose();
      onDone();
    } catch (e) {
      toast.bad(e);
    }
  }
  return (
    <Modal title="Attach to a clip" onClose={onClose}>
      {!data ? (
        <Skeleton />
      ) : data.clips.length === 0 ? (
        <p className="soft">
          No approved clips yet. <Link to="/review">Open Review</Link>
        </p>
      ) : (
        <div className="list">
          {data.clips.map((c) => (
            <button key={c.id} type="button" className="list-row attach-row" onClick={() => pick(c.id)}>
              {c.hook_text || "Clip"}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

