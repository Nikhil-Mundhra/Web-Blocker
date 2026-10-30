import storage from "./storage";
import removeProtocol from "./helpers/remove-protocol";
import { isPaused, getRemainingPauseSeconds } from "./helpers/pause";
import scrollTax from "./helpers/scroll-tax";
import {
  normalizeHost,
  getTimeRemaining,
  isSiteExtensionActive,
  recordTimeUsage,
  hasExceededTimeLimit,
} from "./helpers/time-limits";

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

  document.body.classList.add("ready");

  // Keep background service worker awake and inform it that the popup is open
  let popupPort: chrome.runtime.Port | null = null;
  try {
    if (chrome.runtime && chrome.runtime.connect) {
      popupPort = chrome.runtime.connect({ name: "popup" });
    }
  } catch {
    // Ignore if runtime.connect is not available in test environment
  }

  let tabUrl = "";
  let tabId: number | undefined;
  let isHttp = false;
  let parsedHost = "";
  let lastSeenUsedSeconds = -1;
  let lastUsageTickAt = Date.now();

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabUrl = activeTab?.url || "";
    tabId = activeTab?.id;
    isHttp = tabUrl.startsWith("http://") || tabUrl.startsWith("https://");

    if (isHttp) {
      try {
        parsedHost = new URL(tabUrl).host;
      } catch {
        parsedHost = "";
      }
    }
  } catch (err) {
    console.warn("Could not query active tab:", err);
  }

  currentUrlEl.textContent = parsedHost || (isHttp ? removeProtocol(tabUrl) : "ScrollTax Focus");

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
      pauseActions.classList.add("hidden");
      pauseActions.classList.remove("hidden");
    }

    const norm = parsedHost ? normalizeHost(parsedHost) : "";
    const limitMinutes = norm ? timeLimits[norm] : undefined;

    if (limitMinutes && limitMinutes > 0 && timeLimitCard) {
      timeLimitCard.classList.remove("hidden");
      const { usedSeconds, remainingSeconds } = getTimeRemaining(norm, timeLimits, dailyUsage);
      if (lastSeenUsedSeconds !== -1 && usedSeconds !== lastSeenUsedSeconds) {
        lastUsageTickAt = Date.now();
      }
      lastSeenUsedSeconds = usedSeconds;

      const usedMinutes = Math.floor(usedSeconds / 60);
      const usedRemSeconds = usedSeconds % 60;
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
        const usedText = usedRemSeconds > 0 ? `${usedMinutes}m ${usedRemSeconds}s` : `${usedMinutes}m`;
        timeLimitCaption.textContent = `${usedText} used of ${limitMinutes}m allowance`;
      }
    } else if (timeLimitCard) {
      timeLimitCard.classList.add("hidden");
    }
  };

  if (chrome.storage?.local?.onChanged) {
    chrome.storage.local.onChanged.addListener(() => {
      updateState().catch((err) => console.warn("Error in popup storage listener:", err));
    });
  }

  // Every 5 seconds while popup is open, ensure time usage ticks by 5s and UI updates
  const usageInterval = setInterval(async () => {
    if (!isHttp || !parsedHost) return;

    const norm = normalizeHost(parsedHost);
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

    if (!enabled || isPaused(pausedUntil) || !timeLimits[norm]) {
      return;
    }

    const beforeUsed = getTimeRemaining(norm, timeLimits, dailyUsage).usedSeconds;

    if (Date.now() - lastUsageTickAt >= 4500) {
      let handledByBackground = false;
      if (chrome.runtime && chrome.runtime.sendMessage) {
        try {
          await new Promise<void>((resolve) => {
            chrome.runtime.sendMessage({ type: "TICK_TIME_USAGE", tabId, url: tabUrl }, () => {
              // Ignore chrome.runtime.lastError if any
              void chrome.runtime?.lastError;
              resolve();
            });
          });
          const latest = await storage.get(["dailyUsage"]);
          const afterUsed = getTimeRemaining(norm, timeLimits, latest.dailyUsage || {}).usedSeconds;
          if (afterUsed > beforeUsed) {
            handledByBackground = true;
            lastUsageTickAt = Date.now();
          }
        } catch {
          // Fallback to local increment below
        }
      }

      if (!handledByBackground && Date.now() - lastUsageTickAt >= 4500) {
        const updatedUsage = recordTimeUsage(norm, 5, dailyUsage);
        lastUsageTickAt = Date.now();
        await storage.set({ dailyUsage: updatedUsage });

        if (tabId && hasExceededTimeLimit(norm, timeLimits, updatedUsage, siteExtensions)) {
          scrollTax({
            blocked: [norm],
            tabId,
            url: tabUrl,
            reason: `Daily Limit Exceeded (${timeLimits[norm]} min)`,
          });
        }
      }
    }

    await updateState();
  }, 5000);

  const timer = setInterval(() => {
    updateState().catch((err) => console.warn("Error in popup timer:", err));
  }, 1000);

  window.addEventListener("unload", () => {
    clearInterval(usageInterval);
    clearInterval(timer);
    if (popupPort) {
      try {
        popupPort.disconnect();
      } catch {
        // Ignore
      }
    }
  });

  try {
    await updateState();
  } catch (err) {
    console.warn("Error running updateState in popup:", err);
  }

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