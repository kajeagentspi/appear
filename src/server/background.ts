import { refreshDueSchedules } from "./refresh";

const BACKGROUND_TICK_MS = 60_000;

declare global {
  var appearBackgroundRefreshTimer: NodeJS.Timeout | undefined;
}

export function startBackgroundRefresh(): void {
  if (
    !process.env.AIAND_API_KEY ||
    !process.env.AIAND_BASE_URL ||
    !process.env.AIAND_MODEL ||
    globalThis.appearBackgroundRefreshTimer
  ) {
    return;
  }

  const tick = () => {
    void refreshDueSchedules();
  };
  tick();
  const timer = setInterval(tick, BACKGROUND_TICK_MS);
  timer.unref();
  globalThis.appearBackgroundRefreshTimer = timer;
}
