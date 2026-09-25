import type { Page } from "@playwright/test";

/** Log in through the real one-time-code flow; fake services return the code in the response. */
export async function login(page: Page, email = "seq.taylor@gmail.com") {
  const res = await page.request.post("/api/auth/request", { data: { email } });
  const { dev_code } = (await res.json()) as { dev_code?: string };
  if (!dev_code) throw new Error("fake services did not return a login code");
  const v = await page.request.post("/api/auth/verify", { data: { email, code: dev_code } });
  if (!v.ok()) throw new Error(`verify failed: ${v.status()}`);
}
