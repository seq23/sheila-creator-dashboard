// Dump (section 7): two doors, drop files, notes, the Dump button, progress, recent dumps.
// Phone-first: "Choose from camera roll", many files at once, resumable chunked uploads.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AssetRow, DumpSummary } from "@shared/types";
import { del, get, patch, post } from "../lib/api";
import { uploadFile } from "../lib/upload";
import { fmtBytes, fmtDate, plural } from "../lib/format";
import { Card, Empty, HelpButton, Notice, PageHead, Skeleton, useLoad, useToast } from "../components/ui";
import { PLATFORMS, PLATFORM_LABEL } from "@shared/constants";

type Door = "new" | "recycle";

interface Local {
  file: File;
  fraction: number;
  status: "uploading" | "uploaded" | "failed";
  assetId?: string;
  error?: string;
}

export function Dump() {
  const { id: routeId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [door, setDoor] = useState<Door>("new");
  const [dumpId, setDumpId] = useState<string | null>(routeId ?? null);
  const [notes, setNotes] = useState("");
  const [local, setLocal] = useState<Local[]>([]);
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useLoad(() => get<DumpSummary[]>("/api/dumps"), [dumpId]);
  const current = useLoad(() => (dumpId ? get<{ dump: DumpSummary; assets: AssetRow[] }>(`/api/dumps/${dumpId}`) : Promise.resolve(null)), [dumpId]);
  // Uploads outlive the render that started them; always reload through the latest loader.
  const reloadRef = useRef(current.reload);
  reloadRef.current = current.reload;
  const reloadCurrent = useCallback(() => reloadRef.current(), []);
  const dumpStatus = current.data?.dump.status;

  useEffect(() => {
    if (current.data) {
      setDoor(current.data.dump.door);
      setNotes(current.data.dump.notes);
    }
  }, [current.data]);

  // A dump in progress polls its status while cutting.
  useEffect(() => {
    if (!dumpStatus || !["queued", "cutting"].includes(dumpStatus)) return;
    const t = setInterval(reloadCurrent, 8000);
    return () => clearInterval(t);
  }, [dumpStatus, reloadCurrent]);

  const ensureDump = useCallback(async (): Promise<string> => {
    if (dumpId) return dumpId;
    const r = await post<{ id: string }>("/api/dumps", { door, notes });
    setDumpId(r.id);
    nav(`/dump/${r.id}`, { replace: true });
    return r.id;
  }, [dumpId, door, notes, nav]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name));
    if (!list.length) {
      toast.bad(new Error("Pick video files (MOV, MP4, WebM)."));
      return;
    }
    let id: string;
    try {
      id = await ensureDump();
    } catch (e) {
      toast.bad(e);
      return;
    }
    const start = local.length;
    setLocal((xs) => [...xs, ...list.map((file) => ({ file, fraction: 0, status: "uploading" as const }))]);
    // Upload three at a time so a phone connection is not swamped.
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const i = idx++;
        const file = list[i];
        const pos = start + i;
        try {
          const h = await uploadFile(file, "video", id, (fraction) => setLocal((xs) => xs.map((x, j) => (j === pos ? { ...x, fraction } : x))));
          setLocal((xs) => xs.map((x, j) => (j === pos ? { ...x, status: "uploaded", fraction: 1, assetId: h.id } : x)));
        } catch (e) {
          setLocal((xs) => xs.map((x, j) => (j === pos ? { ...x, status: "failed", error: e instanceof Error ? e.message : "failed" } : x)));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    reloadCurrent();
  }

  async function saveNotes(v: string) {
    setNotes(v);
    if (dumpId) await patch(`/api/dumps/${dumpId}`, { notes: v }).catch(() => undefined);
  }

  async function removeAsset(assetId: string) {
    if (!dumpId) return;
    try {
      await del(`/api/dumps/${dumpId}/assets/${assetId}`);
      setLocal((xs) => xs.filter((x) => x.assetId !== assetId));
      reloadCurrent();
    } catch (e) {
      toast.bad(e);
    }
  }

  async function send() {
    if (!dumpId) return;
    setSending(true);
    try {
      await patch(`/api/dumps/${dumpId}`, { notes });
      await post(`/api/dumps/${dumpId}/dump`);
      toast.ok("Dumped. We'll email you when the clips are ready to review.");
      setLocal([]);
      reloadCurrent();
      recent.reload();
    } catch (e) {
      toast.bad(e);
    } finally {
      setSending(false);
    }
  }

  function startNew() {
    setDumpId(null);
    setLocal([]);
    setNotes("");
    nav("/dump", { replace: true });
  }

  const dump = current.data?.dump ?? null;
  const assets = current.data?.assets ?? [];
  const editable = !dump || dump.status === "uploading";
  const uploading = local.some((l) => l.status === "uploading");
  const uploadedCount = new Set([...local.filter((l) => l.status === "uploaded").map((l) => l.assetId), ...assets.filter((a) => a.upload_status === "uploaded").map((a) => a.id)]).size;
  const totalBytes = assets.reduce((n, a) => n + a.size_bytes, 0);

  return (
    <div className="page">
      <PageHead title="Dump videos">{dump && !editable ? <button className="btn quiet" onClick={startNew}>Start a new dump</button> : null}</PageHead>

      <div className="split">
        <div className="section" style={{ gap: 20 }}>
          {editable ? (
            <>
              <div className="grid cols-2">
                <button type="button" className={`door ${door === "new" ? "on" : ""}`} onClick={() => setDoor("new")} aria-pressed={door === "new"}>
                  <span className="door-key">A</span>
                  <span className="door-title">New raw footage</span>
                  <span className="hint">Never posted. We cut it into lots of short clips.</span>
                </button>
                <button type="button" className={`door ${door === "recycle" ? "on" : ""}`} onClick={() => setDoor("recycle")} aria-pressed={door === "recycle"}>
                  <span className="door-key">B</span>
                  <span className="door-title">Recycle old videos</span>
                  <span className="hint">Already posted. We give them a new hook and wait 90 days per platform.</span>
                </button>
              </div>

              <div
                className={`dropzone ${over ? "over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" ? inputRef.current?.click() : undefined)}
              >
                <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 600 }}>Drop videos here</div>
                <div className="hint">or choose from your camera roll · any size · many at once</div>
                <span className="btn dark" style={{ marginTop: 6 }}>
                  Choose videos
                </span>
                <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
              </div>
            </>
          ) : (
            <Notice tone={dump.status === "failed" ? "bad" : dump.status === "ready" ? "ok" : "info"}>
              <span>
                {dump.status === "queued" || dump.status === "cutting" ? (
                  <>
                    <strong>Cutting…</strong> {dump.progress ? `${dump.progress.step} (${dump.progress.done}/${dump.progress.total})` : "usually 10 to 30 minutes"}. We'll email you when the clips are ready. You can leave this page.
                  </>
                ) : dump.status === "ready" ? (
                  <>
                    <strong>{plural(dump.clips_made, "clip")} ready.</strong> <Link to="/review">Review them now</Link>
                  </>
                ) : dump.status === "reviewed" ? (
                  <>This dump has been reviewed.</>
                ) : (
                  <>
                    <strong>Something went wrong cutting this dump.</strong> {dump.error_summary ?? ""} <Link to="/help/clips-look-wrong">What to do</Link>
                  </>
                )}
              </span>
            </Notice>
          )}

          {(local.length > 0 || assets.length > 0) && (
            <Card className="flat">
              <div className="row between">
                <strong>
                  {plural(Math.max(local.length, assets.length), "video")}
                  {totalBytes ? ` · ${fmtBytes(totalBytes)}` : ""}
                </strong>
                {uploading ? <span className="pill warn">Uploading · keep this page open</span> : null}
              </div>
              <div className="list">
                {local.map((l, i) => (
                  <div key={`l${i}`} className="list-row">
                    <div className="grow">
                      <div className="title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.file.name}
                      </div>
                      <div className="meter" style={{ marginTop: 6 }}>
                        <span style={{ width: `${l.fraction * 100}%`, background: l.status === "failed" ? "var(--danger)" : undefined }} />
                      </div>
                    </div>
                    <span className="meta mono">{l.status === "uploaded" ? "Uploaded" : l.status === "failed" ? "Failed" : `${Math.round(l.fraction * 100)}%`}</span>
                  </div>
                ))}
                {assets
                  .filter((a) => !local.some((l) => l.assetId === a.id))
                  .map((a) => (
                    <AssetLine key={a.id} asset={a} door={door} dumpId={dumpId!} editable={editable} onRemove={() => removeAsset(a.id)} />
                  ))}
              </div>
            </Card>
          )}

          {editable ? (
            <>
              <div className="field">
                <label htmlFor="notes">Notes for this dump</label>
                <textarea id="notes" className="textarea" rows={3} value={notes} onChange={(e) => saveNotes(e.target.value)} placeholder="e.g. Trip weekend, lean funny. The kitchen one is my favorite." />
              </div>
              <div className="row wrap">
                <button className="btn big" disabled={sending || uploading || uploadedCount === 0} onClick={send}>
                  {sending ? "Sending…" : "Dump"}
                </button>
                <span className="hint">We'll email you when the clips are ready to review.</span>
              </div>
            </>
          ) : null}
        </div>

        <aside className="section">
          <h2>Recent dumps</h2>
          {recent.loading && !recent.data ? <Skeleton /> : null}
          {recent.data && recent.data.length === 0 ? <Empty title="Nothing dumped yet">Your first dump shows up here.</Empty> : null}
          {recent.data && recent.data.length > 0 ? (
            <Card className="flat">
              <div className="list">
                {recent.data.map((d) => (
                  <Link key={d.id} to={d.status === "ready" ? "/review" : `/dump/${d.id}`} className="list-row" style={{ textDecoration: "none" }}>
                    <div className="grow">
                      <div className="title">
                        {fmtDate(d.created_at)} · Door {d.door === "new" ? "A" : "B"} · {plural(d.files, "video")}
                      </div>
                      <div className="meta">{d.clips_made ? `${plural(d.clips_made, "clip")} made` : d.status === "cutting" && d.progress ? `${d.progress.step}…` : ""}</div>
                    </div>
                    <span className={`pill ${d.status === "ready" ? "ok" : d.status === "failed" ? "bad" : d.status === "reviewed" ? "ok" : ""}`}>
                      {d.status === "ready" ? "Ready for review" : d.status === "reviewed" ? "Reviewed" : d.status === "failed" ? "Needs a look" : d.status === "uploading" ? "Draft" : "Cutting"}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
      <HelpButton guide={door === "new" ? "dump-new-footage" : "recycle-old-videos"} />
    </div>
  );
}

function AssetLine({ asset, door, dumpId, editable, onRemove }: { asset: AssetRow; door: Door; dumpId: string; editable: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(asset.original_platform ?? "");
  const [posted, setPosted] = useState(asset.original_posted_at?.slice(0, 10) ?? "");
  const [views, setViews] = useState(asset.original_views?.toString() ?? "");
  const [note, setNote] = useState(asset.file_note ?? "");
  async function save() {
    await patch(`/api/dumps/${dumpId}/assets/${asset.id}`, { fileNote: note, originalPlatform: platform || undefined, originalPostedAt: posted || undefined, originalViews: views ? Number(views) : undefined }).catch(() => undefined);
    setOpen(false);
  }
  return (
    <div>
      <div className="list-row">
        <div className="grow">
          <div className="title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.file_name}
          </div>
          <div className="meta">
            {fmtBytes(asset.size_bytes)}
            {asset.file_note ? ` · ${asset.file_note}` : ""}
            {door === "recycle" && asset.original_platform ? ` · ${asset.original_platform}${asset.original_views ? ` · ${asset.original_views.toLocaleString()} views` : ""}` : ""}
          </div>
        </div>
        {editable ? (
          <>
            <button className="btn quiet small" onClick={() => setOpen((v) => !v)}>
              {door === "recycle" ? "Posted on…" : "Note"}
            </button>
            <button className="icon-btn" aria-label="Remove this video" onClick={onRemove}>
              ×
            </button>
          </>
        ) : (
          <span className="meta">{asset.upload_status === "uploaded" ? "Uploaded" : asset.upload_status}</span>
        )}
      </div>
      {open ? (
        <div className="section" style={{ padding: "0 0 12px" }}>
          <div className="field">
            <label>Note for this video</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know about this one" />
          </div>
          {door === "recycle" ? (
            <div className="grid cols-3">
              <div className="field">
                <label>Where it was posted</label>
                <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option value="">Not sure</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>When (roughly)</label>
                <input className="input" type="date" value={posted} onChange={(e) => setPosted(e.target.value)} />
              </div>
              <div className="field">
                <label>Views, if you know</label>
                <input className="input" inputMode="numeric" value={views} onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 12000" />
              </div>
            </div>
          ) : null}
          <div className="btn-row">
            <button className="btn small" onClick={save}>
              Save
            </button>
            <button className="btn quiet small" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
