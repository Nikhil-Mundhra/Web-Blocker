import storage from "./storage";
import removeProtocol from "./helpers/remove-protocol";
import { isPaused, getRemainingPauseSeconds } from "./helpers/pause";
import scrollTax from "./helpers/scroll-tax";

window.addEventListener("DOMContentLoaded", async () => {
  const currentUrlEl = document.getElementById("current-url") as HTMLDivElement;
  const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
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
    const { enabled, pausedUntil } = await storage.get(["enabled", "pausedUntil"]);

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
  };

  await updateState();

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