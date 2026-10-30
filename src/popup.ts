import storage from "./storage";
import removeProtocol from "./helpers/remove-protocol";
import { isPaused, getRemainingPauseSeconds } from "./helpers/pause";
import scrollTax from "./helpers/scroll-tax";
import { normalizeHost, getTimeRemaining, isSiteExtensionActive } from "./helpers/time-limits";

window.addEventListener("DOMContentLoaded", async () => {
  const currentUrlEl = document.getElementById("current-url") as HTMLDivElement;
  const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
  const timeLimitCard = document.getElementById("time-limit-card") as HTMLDivElement;
  const timeLimitRemaining = document.getElementById("time-limit-remaining") as HTMLSpanElement;
  const timeProgressFill = document.getElementById("time-progress-fill") as HTMLDivElement;
  const timeLimitCaption = document.getElementById("time-limit-caption") as HTMLDivElement;
  const blockPageBtn = document.getElementById("block-page-btn") as HTMLButtonElement;
  const blockSiteBtn = document.getElementById("block-site-btn") as HTMLButtonElement;
  const pauseStatus = document.getElementById("pause-status") as HTMLDivElement;
  const pauseCountdown = document.getElementById("pause-countdown") as HTMLSpanElement;
  const pauseActions = document.getElementById("pause-actions") as HTMLDivElement;
  const pause1mBtn = document.getElementById("pause-1m-btn") as HTMLButtonElement;
  const pause5mBtn = document.getElementById("pause-5m-btn") as HTMLButtonElement;
  const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;
  const optionsLink = document.getElementById("options-link") as HTMLAnchorElement;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = activeTab?.url || "";
  const tabId = activeTab?.id;
  const isHttp = tabUrl.startsWith("http://") || tabUrl.startsWith("https://");

  let parsedHost = "";
  try {
    parsedHost = isHttp ? new URL(tabUrl).host : "";
  } catch {
    parsedHost = "";
  }

  currentUrlEl.textContent = parsedHost || (isHttp ? removeProtocol(tabUrl) : "Not a webpage");

  if (!isHttp || !tabId) {
    blockPageBtn.disabled = true;
    blockSiteBtn.disabled = true;
  }

  const updateState = async () => {
    const {
      enabled,
      pausedUntil,
      timeLimits = {},
      dailyUsage = {},
      siteExtensions = {},
    } = await storage.get([
      "enabled",
      "pausedUntil",
      "timeLimits",
      "dailyUsage",
      "siteExtensions",
    ]);

    if (!enabled) {
      statusBadge.textContent = "Disabled";
      statusBadge.className = "badge inactive";
      pauseStatus.classList.add("hidden");
      pauseActions.classList.remove("hidden");
    } else if (isPaused(pausedUntil)) {
      statusBadge.textContent = "Paused";
      statusBadge.className = "badge paused";
      pauseStatus.classList.remove("hidden");
      pauseActions.classList.add("hidden");
      pauseCountdown.textContent = String(getRemainingPauseSeconds(pausedUntil));
    } else {
      statusBadge.textContent = "Active";
      statusBadge.className = "badge";
      pauseStatus.classList.add("hidden");
      pauseActions.classList.remove("hidden");
    }

    const norm = parsedHost ? normalizeHost(parsedHost) : "";
    const limitMinutes = norm ? timeLimits[norm] : undefined;

    if (limitMinutes && limitMinutes > 0 && timeLimitCard) {
      timeLimitCard.classList.remove("hidden");
      const { usedSeconds, remainingSeconds } = getTimeRemaining(norm, timeLimits, dailyUsage);
      const usedMinutes = Math.floor(usedSeconds / 60);
      const percent = Math.min(100, Math.round((usedSeconds / (limitMinutes * 60)) * 100));
      const isExtended = isSiteExtensionActive(norm, siteExtensions);

      let fillClass = "time-progress-fill";
      let badgeClass = "timer-badge";
      if (remainingSeconds <= 60 || percent >= 100) {
        fillClass += " danger";
        badgeClass += " danger";
      } else if (remainingSeconds <= 5 * 60 || percent >= 80) {
        fillClass += " warning";
        badgeClass += " warning";
      }

      if (timeProgressFill) {
        timeProgressFill.className = fillClass;
        timeProgressFill.style.width = `${percent}%`;
      }

      if (timeLimitRemaining) {
        if (isExtended) {
          timeLimitRemaining.textContent = "EXTENDED";
          timeLimitRemaining.className = "timer-badge";
        } else {
          const remMins = Math.floor(remainingSeconds / 60);
          const remSecs = remainingSeconds % 60;
          timeLimitRemaining.textContent = `${remMins}m ${remSecs}s left`;
          timeLimitRemaining.className = badgeClass;
        }
      }

      if (timeLimitCaption) {
        timeLimitCaption.textContent = `${usedMinutes}m used of ${limitMinutes}m allowance`;
      }
    } else if (timeLimitCard) {
      timeLimitCard.classList.add("hidden");
    }
  };

  await updateState();
  document.body.classList.add("ready");

  const timer = setInterval(() => {
    updateState();
  }, 1000);

  window.addEventListener("unload", () => {
    clearInterval(timer);
  });

  blockPageBtn.addEventListener("click", async () => {
    if (!isHttp || !tabId) return;
    const ruleToAdd = removeProtocol(tabUrl);
    const { blocked } = await storage.get(["blocked"]);
    if (!blocked.includes(ruleToAdd)) {
      const updatedBlocked = [...blocked, ruleToAdd];
      await storage.set({ blocked: updatedBlocked });
      scrollTax({ blocked: updatedBlocked, tabId, url: tabUrl });
    }
    window.close();
  });

  blockSiteBtn.addEventListener("click", async () => {
    if (!isHttp || !tabId || !parsedHost) return;
    const ruleToAdd = parsedHost;
    const { blocked } = await storage.get(["blocked"]);
    if (!blocked.includes(ruleToAdd)) {
      const updatedBlocked = [...blocked, ruleToAdd];
      await storage.set({ blocked: updatedBlocked });
      scrollTax({ blocked: updatedBlocked, tabId, url: tabUrl });
    }
    window.close();
  });

  const pauseForMinutes = async (minutes: number) => {
    const pausedUntil = Date.now() + minutes * 60 * 1000;
    await storage.set({ pausedUntil });
    await updateState();
  };

  pause1mBtn.addEventListener("click", () => pauseForMinutes(1));
  pause5mBtn.addEventListener("click", () => pauseForMinutes(5));

  resumeBtn.addEventListener("click", async () => {
    await storage.set({ pausedUntil: null });
    await updateState();
  });

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
});