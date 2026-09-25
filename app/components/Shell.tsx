// Desktop sidebar + phone bottom tab bar (section 4). Badges: Review count, Deals follow-ups,
// Voice "Off" until switched on. The Voice item is hidden entirely unless the feature is on.
import { NavLink, Outlet } from "react-router-dom";
import type { Me } from "@shared/types";
import { useApp } from "../state";
import { Tour } from "./Tour";

const NAV: { to: string; label: string; icon: string; badge?: (s: ShellCounts) => string | number | undefined; feature?: keyof Me["features"] }[] = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/dump", label: "Dump", icon: "＋" },
  { to: "/review", label: "Review", icon: "▶", badge: (s) => s.reviewCount || undefined },
  { to: "/calendar", label: "Calendar", icon: "▦" },
  { to: "/deals", label: "Deals", icon: "✦", badge: (s) => s.followups || undefined },
  { to: "/brain", label: "Client Brain", icon: "◎" },
  { to: "/research", label: "Research", icon: "◈" },
  { to: "/stats", label: "Stats", icon: "▲" },
  { to: "/voice", label: "Voice", icon: "♪", feature: "voice" },
  { to: "/settings", label: "Settings", icon: "⚙" },
  { to: "/help", label: "Help", icon: "?" },
];

const TABS = ["/", "/dump", "/review", "/calendar", "/help"];

export interface ShellCounts {
  reviewCount: number;
  followups: number;
}

export function Shell() {
  const { me, counts, health } = useApp();
  const items = NAV.filter((n) => !n.feature || me?.features[n.feature]);
  const allOk = health.every((h) => h.light === "green" || h.light === "grey");
  const badge = (n: (typeof NAV)[number]) => n.badge?.(counts);
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Sheila Studio home">
          <span className="brand-mark">
            <img src="/assets/brand/sheila-logo.png" alt="" />
          </span>
          <span>
            <div className="brand-name">Sheila Studio</div>
            <div className="brand-sub">a Sheila Bruce affair</div>
          </span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}>
              <span aria-hidden="true" style={{ width: 18, textAlign: "center", opacity: 0.8 }}>
                {n.icon}
              </span>
              {n.label}
              {badge(n) ? <span className="badge">{badge(n)}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <span className={`dot ${allOk ? "green" : "yellow"}`} />
            {allOk ? "All systems OK" : "Something needs you"}
          </div>
          <div style={{ opacity: 0.7, fontSize: "0.78rem" }}>{me?.email}</div>
        </div>
      </aside>
      <main className="main" id="main">
        <Outlet />
        <Tour />
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => TABS.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"}>
            <span aria-hidden="true" style={{ fontSize: "1.2rem" }}>
              {n.icon}
            </span>
            {n.label}
            {badge(n) ? <span className="badge">{badge(n)}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
