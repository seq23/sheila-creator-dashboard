// Public, unauthenticated API: the media kit page (section 12b.1): its data, its photo and the
// one-page printable version the browser saves as PDF. Nothing else is public.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { publicMediaKit, readKit } from "./mediakit";
import { PLATFORM_LABEL } from "@shared/constants";
import type { MediaKitPublic } from "@shared/types";

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

publicRoutes.get("/kit/:slug", async (c) => {
  const kit = await publicMediaKit(c.env, c.req.param("slug"));
  if (!kit) return c.json({ error: "No media kit at this address." }, 404);
  c.header("cache-control", "public, max-age=300");
  return c.json(kit);
});

publicRoutes.get("/kit/:slug/photo", async (c) => {
  const kit = await readKit(c.env);
  if (kit.public_slug !== c.req.param("slug") || !kit.photo_r2_key) return c.text("Not found", 404);
  const obj = await c.env.FILES.get(kit.photo_r2_key);
  if (!obj) return c.text("Not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=3600");
  headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
});

/** One page, printable. `?autoprint=1` opens the print dialog (the "Download PDF" button). */
publicRoutes.get("/kit/:slug/print", async (c) => {
  const kit = await publicMediaKit(c.env, c.req.param("slug"));
  if (!kit) return c.text("No media kit at this address.", 404);
  const html = printableKit(kit, c.env.PUBLIC_BASE_URL, c.req.param("slug"), c.req.query("autoprint") === "1");
  return c.html(html, 200, { "cache-control": "private, max-age=60" });
});

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function num(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function printableKit(kit: MediaKitPublic, baseUrl: string, slug: string, autoprint: boolean): string {
  const link = `${baseUrl}/kit/${slug}`;
  const stats = kit.platforms
    .map((p) => `<div class="stat"><div class="p">${esc(PLATFORM_LABEL[p.platform])}</div><div class="f">${num(p.followers)}</div><div class="l">followers · ${num(p.avg_views)} avg views</div></div>`)
    .join("");
  const clips = kit.featured
    .map((f) => `<li>${esc(f.hook_text || "Clip")} — <a href="${esc(baseUrl + f.media_url)}">${esc(baseUrl + f.media_url)}</a></li>`)
    .join("");
  const rates = kit.rates
    ? `<h2>Rates</h2><table>${Object.entries(kit.rates)
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(kit.name)} · media kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Montserrat:wght@400;600&family=Allura&display=swap" rel="stylesheet">
<style>
:root{--cream:#f7f1e7;--ink:#211713;--gold:#d7b56d;--rose:#8f4b5b;--muted:#6f625b;--line:rgba(33,23,19,.14)}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px/1.5 Montserrat,system-ui,sans-serif}
.page{max-width:760px;margin:24px auto;padding:36px 40px;background:#fffaf1;border:1px solid var(--line);border-radius:18px}
header{display:flex;gap:22px;align-items:center}
.photo{width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid var(--gold);flex-shrink:0;background:var(--cream)}
.script{font-family:Allura,cursive;color:var(--rose);font-size:30px;line-height:1}
h1{font-family:"Playfair Display",Georgia,serif;font-size:34px;margin:0}
h2{font-family:"Playfair Display",Georgia,serif;font-size:18px;margin:22px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.themes span{display:inline-block;border:1px solid var(--gold);border-radius:999px;padding:2px 12px;margin:0 6px 6px 0;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.stat .p{font-weight:600;font-size:13px}.stat .f{font-family:"Playfair Display",serif;font-size:24px}.stat .l{color:var(--muted);font-size:12px}
table{border-collapse:collapse}td{padding:3px 16px 3px 0}
a{color:var(--rose)}.muted{color:var(--muted)}
.bar{max-width:760px;margin:16px auto 0;text-align:right}
.bar button{font:600 15px Montserrat,sans-serif;min-height:44px;padding:0 20px;border-radius:999px;border:1px solid var(--gold);background:var(--gold);cursor:pointer}
@media (max-width:600px){.page{margin:0;border-radius:0;padding:24px 16px}header{flex-direction:column;text-align:center}.stats{grid-template-columns:1fr}}
@media print{@page{size:letter;margin:12mm}body{background:#fff}.bar{display:none}.page{margin:0;border:0;padding:0;max-width:none}}
</style></head>
<body>
<div class="bar"><button type="button" onclick="window.print()">Print or save as PDF</button></div>
<main class="page">
<header>
${kit.photo_url ? `<img class="photo" src="${esc(kit.photo_url)}" alt="">` : ""}
<div><div class="script">media kit</div><h1>${esc(kit.name)}</h1><p>${esc(kit.bio || "")}</p></div>
</header>
${kit.themes.length ? `<h2>What I make</h2><div class="themes">${kit.themes.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
${kit.audience ? `<h2>Audience</h2><p>${esc(kit.audience)}</p>` : ""}
${stats ? `<h2>Numbers</h2><div class="stats">${stats}</div>` : ""}
${clips ? `<h2>Top clips</h2><ul>${clips}</ul>` : ""}
${kit.past_partners.length ? `<h2>Worked with</h2><p>${kit.past_partners.map(esc).join(" · ")}</p>` : ""}
${rates}
<h2>Work with me</h2>
<p>${kit.contact_email ? `<a href="mailto:${esc(kit.contact_email)}">${esc(kit.contact_email)}</a> · ` : ""}<a href="${esc(link)}">${esc(link)}</a></p>
<p class="muted">Numbers refresh weekly from the platforms.</p>
</main>
${autoprint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>` : ""}
</body></html>`;
}
