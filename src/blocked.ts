import storage, { VALIDATORS, CounterPeriod } from "./storage";
import getBlockedMessage from "./helpers/get-blocked-message";

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);

  const url = params.get("url");
  if (!url) {
    return;
  }

  const rule = params.get("rule");
  if (!rule) {
    return;
  }

  const count = parseInt(params.get("count") || "");
  const period = params.get("period");
  const countParams = (!isNaN(count) && VALIDATORS.counterPeriod(period))
    ? { count, period: period as CounterPeriod }
    : undefined;

  const message = getBlockedMessage({
    url,
    rule,
    countParams,
  });

  const messageEl = document.getElementById("message") as HTMLParagraphElement | null;
  if (messageEl) {
    messageEl.innerHTML = message;
  }

  const snoozeBtn = document.getElementById("snooze-btn") as HTMLButtonElement | null;
  if (snoozeBtn) {
    snoozeBtn.addEventListener("click", () => {
      // Pause for 1 minute (60 seconds)
      const oneMinuteFromNow = Date.now() + 60 * 1000;
      storage.set({ pausedUntil: oneMinuteFromNow }).then(() => {
        window.location.href = url;
      });
    });
  }

  document.body.classList.add("ready");
});