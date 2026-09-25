// Small primitives every screen shares. Keep them dumb; behaviour lives in pages.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Light } from "@shared/types";
import { ApiFailure } from "../lib/api";

// ---------- toasts
interface Toast {
  id: number;
  text: string;
  bad?: boolean;
  fix?: string;
}
const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.bad ? 8000 : 4000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>
            {t.text}
            {t.fix ? (
              <>
                {" "}
                <Link to={`/help/${t.fix}`}>How to fix</Link>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(ToastCtx);
  return {
    ok: (text: string) => push({ text }),
    bad: (e: unknown, fallback = "Something went wrong.") => {
      if (e instanceof ApiFailure) push({ text: e.body.error, bad: true, fix: e.body.fix_guide });
      else push({ text: e instanceof Error && e.message ? e.message : fallback, bad: true });
    },
  };
}

// ---------- data hook
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    loader()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------- pieces
export function PageHead({ eyebrow, title, crumb, children }: { eyebrow?: string; title: ReactNode; crumb?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  );
}

export function Card({ className = "", children, to, accent, onClick }: { className?: string; children: ReactNode; to?: string; accent?: boolean; onClick?: () => void }) {
  const cls = `card${accent ? " accent" : ""}${to || onClick ? " link" : ""} ${className}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  if (onClick)
    return (
      <div className={cls} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === "Enter" ? onClick() : undefined)}>
        {children}
      </div>
    );
  return <div className={cls}>{children}</div>;
}

export function Stat({ label, value, sub, meter, children }: { label: string; value: ReactNode; sub?: ReactNode; meter?: { fraction: number; tone?: "ok" | "warn" }; children?: ReactNode }) {
  return (
    <>
      <div className="card-label">{label}</div>
      <div className="stat">{value}</div>
      {meter ? (
        <div className={`meter ${meter.tone ?? ""}`}>
          <span style={{ width: `${Math.max(0, Math.min(100, meter.fraction * 100))}%` }} />
        </div>
      ) : null}
      {sub ? <div className="hint">{sub}</div> : null}
      {children}
    </>
  );
}

export function Dot({ light }: { light: Light }) {
  return <span className={`dot ${light}`} aria-label={light} />;
}

export function Empty({ title, children, cta }: { title: string; children?: ReactNode; cta?: { to: string; label: string } }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p className="soft">{children}</p> : null}
      {cta ? (
        <Link className="btn" to={cta.to}>
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="section" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" ? onClose() : undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Stepper({ value, min = 0, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <output>{value}</output>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint ? <div className="hint">{hint}</div> : null}
      </span>
    </label>
  );
}

/** The "?" on every screen (section 12c): opens the guide for that exact screen. */
export function HelpButton({ guide }: { guide: string }) {
  return (
    <Link to={`/help/${guide}`} className="help-btn" aria-label="Help for this screen" title="Help for this screen">
      ?
    </Link>
  );
}
