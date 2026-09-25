// First-login tour (section 12c): five short pop-ups pointing at Dump, Review, Calendar, Deals
// and Help. Shown once on Home (localStorage flag "ss-tour-done"); "Replay the tour" in Help
// clears the flag and opens Home. It never blocks the page: no backdrop, the rest of the screen
// stays usable, and Skip ends it for good.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { LAST_SCREEN_KEY, TOUR_KEY } from "../lib/guides";
import "../styles/tour.css";

export const TOUR_STEPS: { to: string; title: string; text: string }[] = [
  { to: "/dump", title: "Dump", text: "Your footage goes here. Pick new or old videos, add a note, and press Dump. The cutter makes the clips." },
  { to: "/review", title: "Review", text: "New clips wait here for you. Approve the ones you like. Nothing ever posts without your yes." },
  { to: "/calendar", title: "Calendar", text: "Approved clips fill your week on their own, up to 10 posts per channel. Drag one to move it." },
  { to: "/deals", title: "Deals", text: "Brands that fit you, with the right public contact and a pitch ready. You send it yourself from Gmail." },
  { to: "/help", title: "Help", text: "Stuck? Every screen has a ? button, and Help has picture-by-picture guides. You can replay this tour there." },
];

function tourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

function visibleLink(to: string): HTMLElement | null {
  const links = Array.from(document.querySelectorAll<HTMLElement>(`.nav a[href="${to}"], .tabbar a[href="${to}"]`));
  return links.find((a) => a.getClientRects().length > 0 && getComputedStyle(a).visibility !== "hidden") ?? null;
}

interface Place {
  top: number;
  left: number;
  side: "right" | "above" | "center";
  ring: DOMRect | null;
}

export function Tour() {
  const loc = useLocation();
  const [step, setStep] = useState<number | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    if (loc.pathname === "/" && !tourDone()) setStep(0);
    // Help's "Email my helper" says which screen she was on; remember the last non-help screen.
    if (!loc.pathname.startsWith("/help")) {
      try {
        sessionStorage.setItem(LAST_SCREEN_KEY, loc.pathname);
      } catch {
        /* ignore */
      }
    }
  }, [loc.pathname]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
    setStep(null);
  }, []);

  const measure = useCallback(() => {
    if (step === null) return;
    const el = visibleLink(TOUR_STEPS[step].to);
    const card = { w: Math.min(320, window.innerWidth - 32), h: 190 };
    if (!el) {
      setPlace({ top: Math.max(16, window.innerHeight / 2 - card.h / 2), left: (window.innerWidth - card.w) / 2, side: "center", ring: null });
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.left < window.innerWidth / 3 && r.top < window.innerHeight - 120) {
      // desktop sidebar: to the right of the link
      setPlace({ top: Math.min(window.innerHeight - card.h - 16, Math.max(16, r.top + r.height / 2 - 40)), left: r.right + 16, side: "right", ring: r });
    } else {
      // phone tab bar: above it, arrow pointing down at the tab
      const left = Math.min(window.innerWidth - card.w - 16, Math.max(16, r.left + r.width / 2 - card.w / 2));
      setPlace({ top: Math.max(16, r.top - card.h - 18), left, side: "above", ring: r });
    }
  }, [step]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" ? finish() : undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null || !place) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const arrowLeft = place.ring && place.side === "above" ? place.ring.left + place.ring.width / 2 - place.left : undefined;

  return (
    <>
      {place.ring ? (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{ top: place.ring.top - 4, left: place.ring.left - 4, width: place.ring.width + 8, height: place.ring.height + 8 }}
        />
      ) : null}
      <div className={`tour-card ${place.side}`} role="dialog" aria-modal="false" aria-label="Quick tour" style={{ top: place.top, left: place.left }}>
        {place.side !== "center" ? <span className="tour-arrow" aria-hidden="true" style={arrowLeft !== undefined ? { left: arrowLeft } : undefined} /> : null}
        <div className="tour-count">
          {step + 1} of {TOUR_STEPS.length}
        </div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="btn-row">
          {step > 0 ? (
            <button type="button" className="btn quiet" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="btn quiet" onClick={finish}>
              Skip tour
            </button>
          )}
          <button type="button" className="btn" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
