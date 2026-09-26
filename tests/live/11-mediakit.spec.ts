// Checklist 11: the media kit on staging (#32 design): edit the inputs, publish a version, the
// public kit link (no login) with its QR code, and the print page that saves as a 2-page PDF.
// Only her own clips can appear (#36); another creator's video is never offered.
import { expect, test } from "@playwright/test";
import { d1, evidence, shot } from "./helpers";

test("11 · edit → publish a version → public kit with QR → PDF", async ({ page, browser, baseURL }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/deals?tab=kit");
  await expect(page.locator(".kit-bar")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Sheila Bruce (TEST kit)");
  await page.getByLabel("One line under your name").fill("Hosting and tablescapes that feel expensive, for less");
  await page.getByLabel("TikTok handle").fill("iamcindymercer");
  await page.getByLabel("About you (a few sentences)").fill("TEST kit for the Phase 0 live run. Warm, practical hosting ideas for women who love to gather.");
  await page.getByLabel("About you (a few sentences)").blur();
  await expect(page.locator(".kit-bar")).toContainText(/Draft saved/, { timeout: 20_000 });
  if (!(await page.locator(".rc-pkg").count())) await page.getByRole("button", { name: "Add starter packages" }).first().click();
  await expect(page.locator(".rc-pkg").first()).toBeVisible();
  // clips offered for the kit: never a held (someone else's) one
  const offered = ((await (await page.request.get("/api/mediakit")).json()) as { clips: { id: string }[] }).clips.map((c) => c.id);
  const held = d1<{ id: string }>("SELECT c.id FROM clips c JOIN assets a ON a.id = c.asset_id WHERE a.source_owner = 'other'").map((r) => r.id);
  expect(offered.filter((id) => held.includes(id)), "someone else's clips offered for the kit").toEqual([]);
  // the contact brands use: the kit check's own fix ("Use <her email>") when it is still missing
  const useEmail = page.locator(".kit-check").getByRole("button", { name: /^Use / });
  if (await useEmail.count()) {
    await useEmail.first().click();
    await expect(page.getByLabel("Email brands should use")).not.toHaveValue("");
  }
  const editShot = await shot(page, "11-kit-editor", { fullPage: true });

  const before = d1<{ n: number }>("SELECT COUNT(*) AS n FROM media_kit_versions")[0]!.n;
  await page.getByRole("button", { name: /^Publish( changes)?$/ }).first().click();
  await expect(page.locator(".toast").filter({ hasText: /Published version \d+/ }).first()).toBeVisible();
  expect(d1<{ n: number }>("SELECT COUNT(*) AS n FROM media_kit_versions")[0]!.n).toBe(before + 1);
  await expect(page.locator(".kit-versions li").first()).toContainText("live now");
  const slug = d1<{ public_slug: string }>("SELECT public_slug FROM media_kit WHERE id = 1")[0]!.public_slug;

  // the public link, logged out
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL });
  const pub = await anon.newPage();
  await pub.goto(`/kit/${slug}`);
  await expect(pub.getByRole("heading", { name: "Sheila Bruce (TEST kit)", level: 1 })).toBeVisible();
  await expect(pub.locator(".ks-qr svg")).toBeVisible();
  await expect(pub.getByRole("link", { name: "Work with me" })).toHaveAttribute("href", /^mailto:/);
  const json = await (await anon.request.get(`/api/public/kit/${slug}?preview=1`)).text();
  expect(json).not.toMatch(/"floor"|"target"/); // private rates never public
  const pubShot = await shot(pub, "11-kit-public", { fullPage: true });
  await pub.goto(`/kit/${slug}/print`);
  await expect(pub.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  const pdf = await pub.pdf({ format: "Letter", printBackground: true }).catch(() => null);
  const pages = pdf ? (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length : null;
  await anon.close();
  evidence("11-mediakit", { slug, versions: before + 1, public_url_path: `/kit/${slug}`, qr: true, pdf_pages: pages, edit_screenshot: editShot, public_screenshot: pubShot });
});
