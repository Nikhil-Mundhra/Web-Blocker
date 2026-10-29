import initStorage from "./storage/init";
import storage from "./storage";
import recreateContextMenu from "./helpers/recreate-context-menu";
import scrollTax from "./helpers/scroll-tax";
import { normalizeHost, hasExceededTimeLimit, recordTimeUsage } from "./helpers/time-limits";

let __enabled: boolean;
let __contextMenu: boolean;
let __blocked: string[];
let __timeLimits: Record<string, number> = {};
let __dailyUsage: Record<string, Record<string, number>> = {};
let __siteExtensions: Record<string, number> = {};

let __activeTabId: number | null = null;
let __activeUrl: string | null = null;
let __windowFocused = true;

initStorage().then(() => {
  storage.get([
    "enabled",
    "contextMenu",
    "blocked",
    "timeLimits",
    "dailyUsage",
    "siteExtensions",
  ]).then(({ enabled, contextMenu, blocked, timeLimits, dailyUsage, siteExtensions }) => {
    __enabled = enabled;
    __contextMenu = contextMenu;
    __blocked = blocked;
    __timeLimits = timeLimits || {};
    __dailyUsage = dailyUsage || {};
    __siteExtensions = siteExtensions || {};

    recreateContextMenu(__enabled && __contextMenu);
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes["enabled"]) {
      __enabled = changes["enabled"].newValue as boolean;
    }

    if (changes["contextMenu"]) {
      __contextMenu = changes["contextMenu"].newValue as boolean;
    }

    if (changes["enabled"] || changes["contextMenu"]) {
      recreateContextMenu(__enabled && __contextMenu);
    }

    if (changes["blocked"]) {
      __blocked = changes["blocked"].newValue as string[];
    }

    if (changes["timeLimits"]) {
      __timeLimits = (changes["timeLimits"].newValue as Record<string, number>) || {};
    }

    if (changes["dailyUsage"]) {
      __dailyUsage = (changes["dailyUsage"].newValue as Record<string, Record<string, number>>) || {};
    }

    if (changes["siteExtensions"]) {
      __siteExtensions = (changes["siteExtensions"].newValue as Record<string, number>) || {};
    }
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    if (details.reason === "update") {
      storage.set({
        lastVersion: currentVersion,
        whatsNewDismissed: false,
      });
    } else if (details.reason === "install") {
      storage.set({
        lastVersion: currentVersion,
        whatsNewDismissed: true,
      });
    }
  } catch {
    // Graceful handling
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Track active window focus
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    __windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  });
}

// Track active tab and active URL
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    __activeTabId = activeInfo.tabId;
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      __activeUrl = tab?.url || null;
    });
  });
}

// Periodic heartbeat: tracks time limits every 5 seconds for the active focused tab
setInterval(() => {
  if (!__enabled || !__windowFocused || !__activeTabId || !__activeUrl || !__activeUrl.startsWith("http")) {
    return;
  }

  const host = normalizeHost(__activeUrl);
  if (!__timeLimits[host]) {
    return;
  }

  // Increment usage by 5 seconds
  __dailyUsage = recordTimeUsage(host, 5, __dailyUsage);
  storage.set({ dailyUsage: __dailyUsage });

  if (hasExceededTimeLimit(host, __timeLimits, __dailyUsage, __siteExtensions)) {
    scrollTax({
      blocked: [host],
      tabId: __activeTabId,
      url: __activeUrl,
      reason: `Daily Limit Exceeded (${__timeLimits[host]} min)`,
    });
  }
}, 5000);

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!__enabled) {
    return;
  }

  const { tabId, url, frameId } = details;
  if (!url || !url.startsWith("http") || frameId !== 0) {
    return;
  }

  const host = normalizeHost(url);
  if (hasExceededTimeLimit(host, __timeLimits, __dailyUsage, __siteExtensions)) {
    scrollTax({
      blocked: [host],
      tabId,
      url,
      reason: `Daily Limit Exceeded (${__timeLimits[host]} min)`,
    });
    return;
  }

  if (!__blocked.length) {
    return;
  }

  scrollTax({ blocked: __blocked, tabId, url });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tabId || !__enabled) {
    return;
  }

  const url = changeInfo.url || tab?.url;
  if (!url || !url.startsWith("http")) {
    return;
  }

  if (tab?.active) {
    __activeTabId = tabId;
    __activeUrl = url;
  }

  const host = normalizeHost(url);
  if (hasExceededTimeLimit(host, __timeLimits, __dailyUsage, __siteExtensions)) {
    scrollTax({
      blocked: [host],
      tabId,
      url,
      reason: `Daily Limit Exceeded (${__timeLimits[host]} min)`,
    });
    return;
  }

  if (!__blocked.length) {
    return;
  }

  const title = changeInfo.title || tab?.title;
  scrollTax({ blocked: __blocked, tabId, url, title });
});
