import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { useApp } from "../state";
import { useToast } from "../components/ui";

export function Login() {
  const { refreshMe } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ ok: boolean; dev_code?: string }>("/api/auth/request", { email });
      setDevCode(r.dev_code ?? null);
      setStage("code");
    } catch (err) {
      toast.bad(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/api/auth/verify", { email, code });
      await refreshMe();
    } catch (err) {
      toast.bad(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="brand-mark">
          <img src="/assets/brand/sheila-logo.png" alt="Sheila Bruce" />
        </span>
        <div style={{ textAlign: "center" }}>
          <div className="script" style={{ fontSize: "1.9rem", lineHeight: 1 }}>
            welcome back
          </div>
          <h1 style={{ fontSize: "1.8rem" }}>Sheila Studio</h1>
        </div>
        {stage === "email" ? (
          <form onSubmit={request} className="section">
            <div className="field">
              <label htmlFor="email">Your email</label>
              <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <div className="hint">We email you a 6-digit code. No password to remember.</div>
            </div>
            <button className="btn big block" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="section">
            <div className="field">
              <label htmlFor="code">The code from your email</label>
              <input id="code" className="input code-input" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus />
              <div className="hint">Sent to {email}. It works for 10 minutes.</div>
              {devCode ? (
                <div className="notice info">
                  Local mode: your code is <strong className="mono">{devCode}</strong>
                </div>
              ) : null}
            </div>
            <button className="btn big block" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Log in"}
            </button>
            <button type="button" className="btn quiet block" onClick={() => setStage("email")}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
