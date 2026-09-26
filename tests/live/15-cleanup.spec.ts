// Checklist 15: put staging back to a sane state through the app's own paths. Connections and
// settings stay (Buffer throwaway connected, OpenRouter, YouTube stats); the posted TEST posts
// stay on the throwaway channels. Everything the run planned comes off the calendar (and out of
// Buffer), the test clips are deleted, the test brand docs and voice overs removed.
// There is no "delete a dump" in the app: a dump with every clip deleted stays in the Dump list
// as history, and the daily lane removes its raw video after 7 days.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { d1, evidence, vaultSecret } from "./helpers";

function testDumps(): string[] {
  const ev = JSON.parse(readFileSync("docs/design/live/evidence.json", "utf8")) as Record<string, { dump_id?: string }>;
  const ids = ["5-dump", "5b-dump-held", "5c-dump-synthetic"].map((k) => ev[k]?.dump_id).filter((x): x is string => !!x);
  // the Looks check's dump (the 246 s third-party test video, cut by the Editing agent's run)
  if (ev["16-looks"]?.dump_id) ids.push(ev["16-looks"].dump_id);
  return ids;
}

test("15 · take the run's posts off, delete its clips, docs and voice overs", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const dumps = testDumps();
  expect(dumps.length).toBeGreaterThanOrEqual(3);
  const inList = `('${dumps.join("','")}')`;

  // 1. Every planned / in-Buffer post of these clips comes off (the route also deletes it in Buffer).
  const active = d1<{ id: string; buffer_post_id: string | null }>(`SELECT p.id, p.buffer_post_id FROM posts p JOIN clips c ON c.id = p.clip_id WHERE c.dump_id IN ${inList} AND p.status IN ('planned','in_buffer','failed')`);
  for (const p of active) expect((await page.request.post(`/api/posts/${p.id}/unschedule`)).ok(), p.id).toBe(true);
  const pulledFromBuffer = active.filter((p) => p.buffer_post_id).map((p) => p.buffer_post_id!);
  for (const id of pulledFromBuffer) {
    const res = await fetch("https://api.buffer.com/", { method: "POST", headers: { Authorization: `Bearer ${vaultSecret("buffer-access-token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "query($id: PostId!) { post(input: { id: $id }) { id status } }", variables: { id } }) });
    const body = (await res.json()) as { data?: { post: { status: string } | null }; errors?: unknown[] };
    expect(body.data?.post ?? null, `Buffer post ${id} is gone`).toBeNull();
  }

  // 2. Delete the test clips (Review's Delete, in bulk).
  const clips = d1<{ id: string }>(`SELECT id FROM clips WHERE dump_id IN ${inList} AND status != 'deleted'`).map((c) => c.id);
  for (let i = 0; i < clips.length; i += 50) {
    const r = await page.request.post("/api/clips/bulk", { data: { action: "delete", ids: clips.slice(i, i + 50) } });
    expect(r.ok(), await r.text()).toBe(true);
  }
  expect(d1<{ n: number }>(`SELECT COUNT(*) AS n FROM clips WHERE dump_id IN ${inList} AND status != 'deleted'`)[0]!.n).toBe(0);

  // 3. Client Brain: remove the test brand docs through the screen (the locked profile stays).
  await page.goto("/brain");
  await expect(page.getByRole("heading", { name: "Client Brain" })).toBeVisible();
  const docs = d1<{ id: string; file_name: string }>("SELECT id, file_name FROM brand_docs WHERE file_name LIKE 'golden-table-%'");
  for (const doc of docs) {
    await page.getByRole("button", { name: `Remove ${doc.file_name}` }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, remove it" }).click();
    await expect(page.getByRole("button", { name: `Remove ${doc.file_name}` })).toHaveCount(docs.filter((d) => d.file_name === doc.file_name).length - docs.slice(0, docs.indexOf(doc) + 1).filter((d) => d.file_name === doc.file_name).length);
  }
  expect(d1<{ n: number }>("SELECT COUNT(*) AS n FROM brand_docs WHERE file_name LIKE 'golden-table-%'")[0]!.n).toBe(0);

  // 4. Voice overs made by the run.
  const narrations = d1<{ id: string }>("SELECT id FROM narrations WHERE script LIKE 'TEST narration%'");
  for (const n of narrations) expect((await page.request.delete(`/api/voice/narrations/${n.id}`)).ok()).toBe(true);

  // 5. The run's deals close through the app's own stage move (there is no delete for a deal).
  const deals = d1<{ id: string; name: string; stage: string }>("SELECT d.id, b.name, d.stage FROM deals d JOIN brands b ON b.id = d.brand_id WHERE d.stage NOT IN ('declined','lost','paid','done')");
  for (const dl of deals) {
    const r = await page.request.post(`/api/deals/deals/${dl.id}/stage`, { data: { stage: dl.name.includes("(TEST)") ? "declined" : "lost", reason: dl.name.includes("(TEST)") ? "Not a fit for my audience" : "They went with someone else" } });
    expect(r.ok(), `${dl.name}: ${await r.text()}`).toBe(true);
  }

  // 6. A post removed on the platform (the owner deleted the Instagram and TikTok TEST posts):
  //    Buffer still reports it sent, the dashboard never re-reads a posted post, so no red light,
  //    no "needs you" / posting-problem email and no re-post. Re-check everything to prove it.
  const since = new Date().toISOString();
  expect((await page.request.post("/api/settings/health/recheck")).ok()).toBe(true);
  const lights = d1<{ name: string; light: string }>("SELECT name, light FROM health WHERE name IN ('Buffer','TikTok (via Buffer)','Instagram (via Buffer)','YouTube (via Buffer)')");
  expect(lights.every((l) => l.light === "green"), JSON.stringify(lights)).toBe(true);
  const posted = d1<{ platform: string; status: string }>("SELECT platform, status FROM posts WHERE url IN ('https://tiktok.com/@iamcindymercer/video/7689660837077847309','https://www.instagram.com/reel/DdvCgMMFRhk/','https://www.youtube.com/shorts/lFDhkdWMj0w')");
  expect(posted.every((p) => p.status === "posted")).toBe(true);
  expect(d1<{ n: number }>(`SELECT COUNT(*) AS n FROM emails_sent WHERE kind IN ('posting_problem','connection_needs_you') AND sent_at >= '${since}'`)[0]!.n).toBe(0);
  expect(d1<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE status IN ('planned','in_buffer')")[0]!.n).toBe(0);

  const left = d1<{ service: string; status: string }>("SELECT service, status FROM connections WHERE status = 'ok'");
  evidence("15-cleanup", { posts_taken_off: active.length, buffer_posts_deleted: pulledFromBuffer.length, clips_deleted: clips.length, docs_removed: docs.length, narrations_deleted: narrations.length, deals_closed: deals.map((d) => d.name), deleted_on_platform_lights: lights, deleted_on_platform_posts: posted, connections_kept: left.map((c) => c.service) });
});
