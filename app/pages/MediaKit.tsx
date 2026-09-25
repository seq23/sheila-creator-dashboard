// Media kit (section 12b.1). `MediaKit` is the public, phone-first page at /kit/:slug (no login):
// photo, one-line bio, themes, audience, followers + average views per platform, top clips, past
// partners, rates only if she entered them, Work with me, Download PDF. `MediaKitEditor` is her
// side of it, shown as the Media kit tab on Deals.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { MediaKitPublic } from "@shared/types";
import { PLATFORM_LABEL } from "@shared/constants";
import { del, get, patch, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { uploadFile } from "../lib/upload";
import { Card, Notice, Skeleton, useLoad, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import "../styles/mediakit.css";

function num(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function MediaKit() {
  const { slug = "" } = useParams();
  const { data, loading, error } = useLoad(() => get<MediaKitPublic>(`/api/public/kit/${encodeURIComponent(slug)}`), [slug]);
  useEffect(() => {
    if (data) document.title = `${data.name} · media kit`;
  }, [data]);
  return (
    <div className="kit-page">
      <main className="kit">
        {loading && !data ? <Skeleton blocks={3} /> : null}
        {error ? (
          <div className="kit-missing">
            <h1>No media kit here</h1>
            <p className="soft">Check the link you were sent.</p>
          </div>
        ) : null}
        {data ? <KitView kit={data} slug={slug} /> : null}
      </main>
    </div>
  );
}

function KitView({ kit, slug }: { kit: MediaKitPublic; slug: string }) {
  const mail = kit.contact_email ? `mailto:${kit.contact_email}?subject=${encodeURIComponent(`Working together: ${kit.name}`)}` : null;
  return (
    <>
      <header className="kit-head">
        {kit.photo_url ? (
          <img className="kit-photo" src={kit.photo_url} alt={kit.name} />
        ) : (
          <span className="kit-mark">
            <img src="/assets/brand/sheila-logo.png" alt={`${kit.name} logo`} />
          </span>
        )}
        <span className="script kit-script">media kit</span>
        <h1>{kit.name}</h1>
        {kit.bio ? <p className="kit-bio">{kit.bio}</p> : null}
        {kit.themes.length ? (
          <div className="kit-themes" aria-label="What I make">
            {kit.themes.map((t) => (
              <span key={t} className="kit-chip">
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {mail ? (
          <a className="btn big kit-cta" data-primary href={mail}>
            Work with me
          </a>
        ) : null}
      </header>

      {kit.platforms.length ? (
        <section className="kit-stats" aria-label="Numbers">
          {kit.platforms.map((p) => (
            <div key={p.platform} className="kit-stat">
              <div className="kit-stat-p">{PLATFORM_LABEL[p.platform]}</div>
              <div className="kit-stat-f nums">{num(p.followers)}</div>
              <div className="kit-stat-l">followers</div>
              <div className="kit-stat-v nums">{num(p.avg_views)} avg views</div>
            </div>
          ))}
        </section>
      ) : null}

      {kit.audience ? (
        <p className="kit-audience">
          <strong>Audience:</strong> {kit.audience}
        </p>
      ) : null}

      {kit.featured.length ? (
        <section className="kit-section" aria-label="Top clips">
          <h2>Top clips</h2>
          <div className="kit-clips">
            {kit.featured.map((f) => (
              <figure key={f.id} className="kit-clip">
                <video src={f.media_url} poster={f.cover_url ?? undefined} controls playsInline preload="none" aria-label={f.hook_text || "Clip"} />
                {f.hook_text ? <figcaption>{f.hook_text}</figcaption> : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {kit.past_partners.length ? (
        <p className="kit-partners">
          <strong>Worked with:</strong> {kit.past_partners.join(" · ")}
        </p>
      ) : null}

      {kit.rates ? (
        <section className="kit-section" aria-label="Rates">
          <h2>Rates</h2>
          <dl className="kit-rates">
            {Object.entries(kit.rates).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="kit-actions">
        {mail ? (
          <a className="btn big block" href={mail}>
            Work with me
          </a>
        ) : null}
        <a className="btn quiet block" href={`/api/public/kit/${encodeURIComponent(slug)}/print?autoprint=1`} target="_blank" rel="noreferrer">
          Download PDF
        </a>
      </div>
    </>
  );
}

// ---------- her side: the Media kit tab on Deals

interface KitOwner {
  kit: {
    bio: string;
    has_photo: boolean;
    featured_clip_ids: string[];
    past_partners: string[];
    rates: Record<string, string> | null;
    public_slug: string;
    contact_email: string | null;
    updated_at: string | null;
  };
  preview: MediaKitPublic | null;
  public_url: string;
  print_url: string;
  profile_locked: boolean;
  clips: { id: string; hook_text: string; score: number; media_url: string; cover_url: string | null }[];
}

export function MediaKitEditor() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => get<KitOwner>("/api/mediakit"));
  const [bio, setBio] = useState("");
  const [featured, setFeatured] = useState<string[]>([]);
  const [partners, setPartners] = useState("");
  const [rates, setRates] = useState<{ k: string; v: string }[]>([]);
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoPct, setPhotoPct] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    setBio(data.kit.bio);
    setFeatured(data.kit.featured_clip_ids);
    setPartners(data.kit.past_partners.join(", "));
    setRates(data.kit.rates ? Object.entries(data.kit.rates).map(([k, v]) => ({ k, v })) : []);
    setEmail(data.kit.contact_email ?? "");
    setSlug(data.kit.public_slug);
  }, [data]);

  if (loading && !data) return <Skeleton blocks={3} columns={2} />;
  if (!data) return <Notice tone="bad">Your media kit did not load. Try again in a moment.</Notice>;

  async function save() {
    setSaving(true);
    try {
      const r = Object.fromEntries(rates.filter((x) => x.k.trim() && x.v.trim()).map((x) => [x.k.trim(), x.v.trim()]));
      await patch("/api/mediakit", {
        bio,
        featured_clip_ids: featured,
        past_partners: partners.split(",").map((s) => s.trim()).filter(Boolean),
        rates: Object.keys(r).length ? r : null,
        contact_email: email.trim() || null,
        public_slug: slug,
      });
      toast.ok("Media kit saved.");
      reload();
    } catch (e) {
      toast.bad(e);
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.bad(new Error("Pick a photo (JPG or PNG)."));
      return;
    }
    try {
      setPhotoPct(0);
      const h = await uploadFile(file, "kit_photo", null, setPhotoPct);
      await post(`/api/mediakit/photo/${h.id}`);
      toast.ok("Photo saved.");
      reload();
    } catch (e) {
      toast.bad(e);
    } finally {
      setPhotoPct(null);
    }
  }

  function toggleClip(id: string) {
    setFeatured((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= 3 ? xs : [...xs, id]));
  }

  const p = data.preview;
  return (
    <div className="kit-editor">
      <Card className="flat kit-link">
        <div className="kit-link-top">
          <div className="grow">
            <div className="card-title">Your public link</div>
            <div className="mono kit-url">{data.public_url}</div>
            <div className="hint">{data.kit.updated_at ? `Saved ${fmtDate(data.kit.updated_at)} · ` : ""}Numbers refresh weekly from your stats.</div>
          </div>
          <div className="btn-row">
            <a className="btn quiet small" href={`/kit/${data.kit.public_slug}`} target="_blank" rel="noreferrer">
              Open my media kit
            </a>
            <a className="btn quiet small" href="/api/mediakit/pdf" target="_blank" rel="noreferrer">
              Download PDF
            </a>
            <button
              type="button"
              className="btn quiet small"
              onClick={() => navigator.clipboard.writeText(data.public_url).then(() => toast.ok("Link copied."), () => toast.bad(new Error("Copy the link by hand.")))}
            >
              Copy link
            </button>
          </div>
        </div>
        <label className="field kit-slug">
          <span className="label">Link name</span>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </label>
      </Card>

      {!data.profile_locked ? <Notice tone="info">Your themes and audience come from your locked Brand Profile. Lock it in Client Brain and they appear here.</Notice> : null}

      <div className="grid cols-2">
        <Card>
          <h2 className="card-title">About you</h2>
          <div className="kit-photo-row">
            {data.kit.has_photo && p?.photo_url ? <img className="kit-photo small" src={p.photo_url} alt="Your media kit photo" /> : <div className="kit-photo small empty" aria-hidden="true" />}
            <div className="btn-row">
              <label className="btn quiet">
                {photoPct !== null ? `Uploading ${Math.round(photoPct * 100)}%` : data.kit.has_photo ? "Change photo" : "Add a photo"}
                <input type="file" accept="image/*" className="sr-only" aria-label="Media kit photo" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
              {data.kit.has_photo ? (
                <button type="button" className="link-btn" onClick={() => del("/api/mediakit/photo").then(reload, (e) => toast.bad(e))}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <label className="field">
            <span className="label">One-line bio</span>
            <textarea className="textarea" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Hosting, style and everyday luxury for women who love to gather." />
            <span className="hint nums">{bio.length}/300</span>
          </label>
          <label className="field">
            <span className="label">Email brands should use</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partnerships@yourdomain.com" />
          </label>
          <label className="field">
            <span className="label">Brands you have worked with (commas between)</span>
            <input className="input" value={partners} onChange={(e) => setPartners(e.target.value)} />
          </label>
        </Card>

        <Card>
          <h2 className="card-title">Your 3 best clips</h2>
          {data.clips.length === 0 ? (
            <p className="soft">Approve some clips in Review first; the best ones show up here to pick from.</p>
          ) : (
            <div className="kit-pick" role="group" aria-label="Pick up to 3 clips">
              {data.clips.map((c) => {
                const on = featured.includes(c.id);
                return (
                  <label key={c.id} className={`kit-pick-item${on ? " on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleClip(c.id)} disabled={!on && featured.length >= 3} />
                    <span className="kit-pick-thumb" aria-hidden="true">
                      {c.cover_url ? <img src={c.cover_url} alt="" /> : <Icon name="review" size="sm" />}
                    </span>
                    <span className="kit-pick-text">{c.hook_text || "Clip"}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="hint nums">{featured.length} of 3 picked</div>
        </Card>
      </div>

      <Card>
        <h2 className="card-title">Rates (optional)</h2>
        <p className="soft">Only shown if you fill them in.</p>
        {rates.map((r, i) => (
          <div key={i} className="kit-rate">
            <input className="input" aria-label={`Rate ${i + 1} label`} placeholder="TikTok video" value={r.k} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
            <input className="input" aria-label={`Rate ${i + 1} price`} placeholder="$800" value={r.v} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
            <button type="button" className="link-btn" onClick={() => setRates(rates.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        {rates.length < 6 ? (
          <button type="button" className="btn quiet small kit-add-rate" onClick={() => setRates([...rates, { k: "", v: "" }])}>
            <Icon name="plus" size="sm" />
            Add a rate
          </button>
        ) : null}
      </Card>

      <div className="kit-save">
        <button type="button" className="btn big" data-primary onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save media kit"}
        </button>
      </div>
    </div>
  );
}
