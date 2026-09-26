// The public sample's demo media (scripts/seed-year.mjs --remote-sample): the files behind every
// R2 key the year's rows point at, so each screen looks full and nothing 404s. Everything is made
// on this Mac from what the repo already holds, never fetched from anywhere:
//   covers / clip videos / full videos / thumbnails  from the Look previews in public/looks/*.webp
//                                                     (ffmpeg: the preview over a blurred copy, 9:16 or 16:9)
//   narrations, her voice sample                     macOS `say` reading the seeded scripts, to mp3
//   mixes                                            the Look's clip video with a narration laid over it
//   music                                            ffmpeg tones with a fade (demo "my songs")
//   the brand guide                                  tests/live/fixtures/golden-table-brand-guide.pdf
//   the kit photo                                    public/assets/brand/sheila-logo.png (the brand mark)
// Uploads go through `wrangler r2 object put` with the args seed-year resolved for the sample
// (--remote --env staging), eight at a time. Demo only: nothing in worker/ or app/ imports this.
import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SIZE_9x16 = { w: 1080, h: 1920 };
const SIZE_16x9 = { w: 1280, h: 720 };
const NARRATIONS = [
  "Three things make a table feel special: light, height, and one thing that surprises your guests.",
  "Start with the napkin. Fold it once, tuck a sprig of something green, and the whole place setting wakes up.",
  "Candles first, then flowers, then plates. Work from the light down and the table sets itself.",
  "You do not need new dishes. You need one colour repeated three times across the table.",
];
const VOICE_SAMPLE = "Hi, it's Sheila. Welcome to my table. Tonight we're keeping it simple, warm and a little bit fancy.";

/** ffmpeg filter: the preview scaled to fit over a blurred, cropped copy of itself. */
const framed = ({ w, h }) => `split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:2[bg];[b]scale=${w}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p`;

async function ffmpeg(args) {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

/**
 * Build one file per distinct (kind, look / variant) and map every key to its file. Returns
 * [{ key, file, contentType }]. `outDir` is reused across runs (a file that exists is kept).
 */
export async function buildSampleMedia(media, { root, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const looks = [...new Set(media.filter((m) => m.look).map((m) => m.look))];
  const preview = (look) => path.join(root, "public", "looks", `${look}.webp`);
  const made = {};
  const once = async (name, make) => {
    const file = path.join(outDir, name);
    if (!existsSync(file)) await make(file);
    return file;
  };
  for (const look of looks) {
    if (!existsSync(preview(look))) throw new Error(`no Look preview for ${look} (public/looks/${look}.webp)`);
    made[`cover:${look}`] = await once(`cover-${look}.jpg`, (f) => ffmpeg(["-i", preview(look), "-vf", framed(SIZE_9x16), "-q:v", "4", f]));
    made[`thumb:${look}`] = await once(`thumb-${look}.jpg`, (f) => ffmpeg(["-i", preview(look), "-vf", framed(SIZE_16x9), "-q:v", "4", f]));
    made[`clip:${look}`] = await once(`clip-${look}.mp4`, (f) => ffmpeg(["-loop", "1", "-framerate", "24", "-t", "6", "-i", preview(look), "-f", "lavfi", "-t", "6", "-i", "anullsrc=r=44100:cl=stereo", "-vf", framed(SIZE_9x16), "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "48k", "-shortest", "-movflags", "+faststart", f]));
    made[`full:${look}`] = await once(`full-${look}.mp4`, (f) => ffmpeg(["-loop", "1", "-framerate", "24", "-t", "20", "-i", preview(look), "-f", "lavfi", "-t", "20", "-i", "anullsrc=r=44100:cl=stereo", "-vf", framed(SIZE_16x9), "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "48k", "-shortest", "-movflags", "+faststart", f]));
  }
  const say = async (file, text) => {
    const aiff = file.replace(/\.mp3$/, ".aiff");
    execFileSync("say", ["-v", "Samantha", "-o", aiff, text]);
    await ffmpeg(["-i", aiff, "-c:a", "libmp3lame", "-b:a", "64k", file]);
  };
  for (const [i, text] of NARRATIONS.entries()) made[`narration:${i}`] = await once(`narration-${i}.mp3`, (f) => say(f, text));
  made.voice = await once("voice-sample.mp3", (f) => say(f, VOICE_SAMPLE));
  for (const look of looks) {
    for (const [i] of NARRATIONS.entries()) {
      made[`mix:${look}:${i}`] = await once(`mix-${look}-${i}.mp4`, (f) => ffmpeg(["-i", made[`clip:${look}`], "-i", made[`narration:${i}`], "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "64k", "-shortest", f]));
    }
  }
  const tones = [[220, 330], [262, 392], [294, 440], [330, 494], [349, 523]];
  for (const [i, [a, b]] of tones.entries()) made[`music:${i}`] = await once(`music-${i}.mp3`, (f) => ffmpeg(["-f", "lavfi", "-i", `sine=frequency=${a}:sample_rate=44100`, "-f", "lavfi", "-i", `sine=frequency=${b}:sample_rate=44100`, "-filter_complex", "[0:a][1:a]amix=inputs=2,volume=0.3,afade=t=in:d=1,afade=t=out:st=13:d=2", "-t", "15", "-c:a", "libmp3lame", "-b:a", "64k", f]));
  made.kitphoto = await once("kit-photo.png", (f) => copyFileSync(path.join(root, "public", "assets", "brand", "sheila-logo.png"), f));
  made.doc = await once("brand-guide.pdf", (f) => copyFileSync(path.join(root, "tests", "live", "fixtures", "golden-table-brand-guide.pdf"), f));

  let n = 0;
  return media.map((m) => {
    const i = n++;
    switch (m.kind) {
      case "cover": return { key: m.key, file: made[`cover:${m.look}`], contentType: "image/jpeg" };
      case "thumb": return { key: m.key, file: made[`thumb:${m.look}`], contentType: "image/jpeg" };
      case "clip": return { key: m.key, file: made[`clip:${m.look}`], contentType: "video/mp4" };
      case "full": return { key: m.key, file: made[`full:${m.look}`], contentType: "video/mp4" };
      case "narration": return { key: m.key, file: made[`narration:${i % NARRATIONS.length}`], contentType: "audio/mpeg" };
      case "mix": return { key: m.key, file: made[`mix:${m.look}:${i % NARRATIONS.length}`], contentType: "video/mp4" };
      case "music": return { key: m.key, file: made[`music:${i % tones.length}`], contentType: "audio/mpeg" };
      case "doc": return { key: m.key, file: made.doc, contentType: "application/pdf" };
      case "kitphoto": return { key: m.key, file: made.kitphoto, contentType: "image/png" };
      case "voice": return { key: m.key, file: made.voice, contentType: "audio/mpeg" };
      default: throw new Error(`unknown media kind ${m.kind}`);
    }
  });
}

/** Upload every built file to the sample's bucket, eight puts at a time. */
export async function uploadSampleMedia(media, { root, bucket, wranglerArgs, outDir = path.join(root, ".sample-media"), concurrency = 8 }) {
  if (!bucket) throw new Error("sample-media: no bucket resolved (seed-year --remote-sample decides the target)");
  const files = await buildSampleMedia(media, { root, outDir });
  let done = 0;
  let failed = 0;
  const queue = [...files];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        await run("npx", ["wrangler", "r2", "object", "put", `${bucket}/${item.key}`, "--file", item.file, "--content-type", item.contentType, ...wranglerArgs], { cwd: root, env: { ...process.env, CI: "1" }, maxBuffer: 8 * 1024 * 1024 });
        done++;
      } catch (e) {
        failed++;
        process.stderr.write(`sample-media: ${item.key} failed: ${String(e.stderr ?? e.message).split("\n").slice(-3).join(" ")}\n`);
      }
      if ((done + failed) % 50 === 0) process.stderr.write(`sample-media: ${done + failed}/${files.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stderr.write(`sample-media: uploaded ${done} of ${files.length}${failed ? `, ${failed} failed` : ""}\n`);
  if (failed) throw new Error(`sample-media: ${failed} uploads failed`);
  return done;
}
