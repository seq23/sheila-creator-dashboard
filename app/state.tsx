// App-wide state: who is logged in, sidebar badge counts, health lights. Refreshed on
// navigation and every 60 s so the Review badge and the health dot stay honest.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { HealthItem, HomeSummary, Me } from "@shared/types";
import { get, setUnauthorizedHandler } from "./lib/api";
import type { ShellCounts } from "./components/Shell";

interface AppState {
  me: Me | null;
  ready: boolean;
  counts: ShellCounts;
  health: HealthItem[];
  refreshMe: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  setMe: (m: Me | null) => void;
}

const Ctx = createContext<AppState>({ me: null, ready: false, counts: { reviewCount: 0, followups: 0 }, health: [], refreshMe: async () => undefined, refreshCounts: async () => undefined, setMe: () => undefined });

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<ShellCounts>({ reviewCount: 0, followups: 0 });
  const [health, setHealth] = useState<HealthItem[]>([]);
  const loc = useLocation();

  const refreshMe = useCallback(async () => {
    try {
      setMe(await get<Me>("/api/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!me) return;
    try {
      const h = await get<HomeSummary>("/api/home");
      setCounts({ reviewCount: h.waiting.clips, followups: h.followups.length });
      setHealth(h.health);
    } catch {
      /* the page will show its own error */
    }
  }, [me]);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 60_000);
    return () => clearInterval(t);
  }, [refreshCounts, loc.pathname]);

  const value = useMemo(() => ({ me, ready, counts, health, refreshMe, refreshCounts, setMe }), [me, ready, counts, health, refreshMe, refreshCounts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
