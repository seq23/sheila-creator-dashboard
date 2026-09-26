// Cron lanes (wrangler.jsonc triggers). Each lane is its own file; this switch is the
// only place a cron string is interpreted. The section 6 brief crons ride the existing three
// expressions rather than adding a fourth: the monthly refresh is a daily check that acts on
// the 1st (retrying the 2nd and 3rd), its "draft ready" email goes out on the next hourly run
// after the research job lands, and the weekly adjustment runs in the Monday lane. Rule 0: a lane never exits having done nothing
// silently. Each lane records a health row so Settings shows "last run".
import type { Env } from "../env";
import { setHealth } from "../lib/db";
import { log, safeError } from "../lib/log";
import { bufferSync } from "./buffer-sync";
import { dailyMaintenance } from "./daily";
import { weekly } from "./weekly";
import { briefDraftNotice, monthlyBriefRefresh, weeklyBriefAdjust } from "./brief";
import { refreshPublicStats } from "../lib/publicStats";

export async function runCron(env: Env, cron: string): Promise<void> {
  const lane = cron === "0 * * * *" ? "buffer-sync" : cron === "30 13 * * *" ? "daily" : cron === "0 12 * * 1" ? "weekly" : "unknown";
  log.info("cron.start", { lane });
  try {
    if (lane === "buffer-sync") {
      await bufferSync(env);
      await briefDraftNotice(env);
    } else if (lane === "daily") {
      await dailyMaintenance(env);
      await monthlyBriefRefresh(env);
      // No-login stats, daily: YouTube's public numbers; Instagram's at most once a day.
      await refreshPublicStats(env);
    } else if (lane === "weekly") {
      await weekly(env);
      await weeklyBriefAdjust(env);
    }
    else {
      log.warn("cron.unknown");
      return;
    }
    await setHealth(env.DB, `Last ${lane} run`, "green", `OK · ${new Date().toUTCString()}`, null);
    log.info("cron.done", { lane });
  } catch (e) {
    await setHealth(env.DB, `Last ${lane} run`, "red", safeError(e), "i-didnt-get-an-email");
    log.error("cron.failed", { lane });
  }
}
