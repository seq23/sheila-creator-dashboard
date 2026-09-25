// Email through Resend (section 11). With FAKE_SERVICES=1 nothing leaves the Worker; the
// message is recorded in emails_sent and, for login codes, returned to the caller so
// local development and tests can log in without a mailbox.
import type { Env } from "../env";
import { fakeServices } from "../env";
import { newId } from "../lib/ids";
import { log } from "../lib/log";

export type EmailKind = "time_to_dump" | "clips_ready" | "posting_problem" | "connection_needs_you" | "weekly_recap" | "login_code";

export interface OutgoingEmail {
  kind: EmailKind;
  to: string[];
  subject: string;
  html: string;
  text: string;
  refId?: string | null;
}

export interface EmailResult {
  ok: boolean;
  providerId: string | null;
  error: string | null;
}

const FROM_DEFAULT = "Sheila Studio <onboarding@resend.dev>";

async function sendReal(env: Env, mail: OutgoingEmail): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) return { ok: false, providerId: null, error: "Resend is not connected." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_DEFAULT, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) return { ok: false, providerId: null, error: `Resend answered ${res.status}` };
  const data = (await res.json()) as { id?: string };
  return { ok: true, providerId: data.id ?? null, error: null };
}

export async function sendEmail(env: Env, mail: OutgoingEmail): Promise<EmailResult> {
  const result = fakeServices(env) ? { ok: true, providerId: `fake_${newId("em")}`, error: null } : await sendReal(env, mail);
  for (const to of mail.to) {
    await env.DB.prepare("INSERT INTO emails_sent (id, kind, to_email, subject, ref_id, provider_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId("eml"), mail.kind, to, mail.subject, mail.refId ?? null, result.providerId)
      .run();
  }
  log.info("email.send", { kind: mail.kind, recipients: mail.to.length, ok: result.ok });
  return result;
}

/** Plain, phone-friendly email frame. Every email says exactly what to click. */
export function emailFrame(title: string, lines: string[], cta?: { label: string; url: string }): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f1e7;font-family:Montserrat,Helvetica,Arial,sans-serif;color:#211713">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<h1 style="font-family:'Playfair Display',Georgia,serif;font-size:26px;margin:0 0 16px">${esc(title)}</h1>
${lines.map((l) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("")}
${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#d7b56d;color:#211713;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(cta.label)}</a></p>` : ""}
<p style="font-size:13px;color:#6f625b;margin-top:32px">Sheila Studio</p>
</div></body></html>`;
  const text = [title, "", ...lines, cta ? `\n${cta.label}: ${cta.url}` : ""].join("\n");
  return { html, text };
}
