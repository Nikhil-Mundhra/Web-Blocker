import initStorage from "./storage/init";
import storage from "./storage";
import recreateContextMenu from "./helpers/recreate-context-menu";
import scrollTax from "./helpers/scroll-tax";
import {
  normalizeHost,
  hasExceededTimeLimit,
  recordTimeUsage,
  getTimeRemaining,
  isSiteExtensionActive,
} from "./helpers/time-limits";
import {
  pushSync,
  pullSync,
  extractSyncPayload,
} from "./helpers/sync";

let __enabled: boolean;
let __contextMenu: boolean;
let __blocked: string[];
let __timeLimits: Record<string, number> = {};
let __dailyUsage: Record<string, Record<string, number>> = {};
let __siteExtensions: Record<string, number> = {};

let __syncEnabled = false;
let __syncKey = "";
let __syncServerUrl = "http://127.0.0.1:8765/sync";
let __lastSyncedAt: number | null = null;
let __syncPushTimeout: NodeJS.Timeout | null = null;

let __activeTabId: number | null = null;
let __activeUrl: string | null = null;
let __windowFocused = true;

const pullRemoteSync = async () => {
  if (!__syncEnabled || !__syncKey) return;
  try {
    const res = await pullSync(__syncKey, __syncServerUrl);
    if (res.ok && res.data && res.data.updatedAt > (__lastSyncedAt || 0)) {
      const remote = res.data;
      __lastSyncedAt = remote.updatedAt;
      await storage.set({
        blocked: remote.blocked,
        mode: remote.mode,
        timeLimits: remote.timeLimits,
        challengePhrase: remote.challengePhrase,
        challengeRepeatCount: remote.challengeRepeatCount,
        schedule: remote.schedule,
        resolution: remote.resolution,
        redirectUrl: remote.redirectUrl,
        disableDelay: remote.disableDelay,
        blockByTitle: remote.blockByTitle,
        lastSyncedAt: remote.updatedAt,
      });
    }
  } catch (err) {
    console.warn("Background sync pull error:", err);
  }
};

const triggerDebouncedPush = () => {
  if (!__syncEnabled || !__syncKey) return;
  if (__syncPushTimeout) clearTimeout(__syncPushTimeout);

  __syncPushTimeout = setTimeout(async () => {
    try {
      const all = await storage.getAll();
      const payload = extractSyncPayload(all);
      const res = await pushSync(__syncKey, __syncServerUrl, payload);
      if (res.ok) {
        __lastSyncedAt = payload.updatedAt;
        await storage.set({ lastSyncedAt: payload.updatedAt });
      }
    } catch (err) {
      console.warn("Background sync push error:", err);
    }
  }, 2500);
};

initStorage().then(() => {
  storage.get([
    "enabled",
    "contextMenu",
    "blocked",
    "timeLimits",
    "dailyUsage",
    "siteExtensions",
    "syncEnabled",
    "syncKey",
    "syncServerUrl",
    "lastSyncedAt",
  ]).then(({
    enabled,
    contextMenu,
    blocked,
    timeLimits,
    dailyUsage,
    siteExtensions,
    syncEnabled,
    syncKey,
    syncServerUrl,
    lastSyncedAt,
  }) => {
    __enabled = enabled;
    __contextMenu = contextMenu;
    __blocked = blocked;
    __timeLimits = timeLimits || {};
    __dailyUsage = dailyUsage || {};
    __siteExtensions = siteExtensions || {};
    __syncEnabled = Boolean(syncEnabled);
    __syncKey = syncKey || "";
    __syncServerUrl = syncServerUrl || "http://127.0.0.1:8765/sync";
    __lastSyncedAt = lastSyncedAt || null;

    recreateContextMenu(__enabled && __contextMenu);
    pullRemoteSync();
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

    if (changes["syncEnabled"]) {
      __syncEnabled = Boolean(changes["syncEnabled"].newValue);
    }

    if (changes["syncKey"]) {
      __syncKey = (changes["syncKey"].newValue as string) || "";
    }

    if (changes["syncServerUrl"]) {
      __syncServerUrl = (changes["syncServerUrl"].newValue as string) || "http://127.0.0.1:8765/sync";
    }

    if (changes["lastSyncedAt"]) {
      __lastSyncedAt = (changes["lastSyncedAt"].newValue as number) || null;
    }

    if (changes["timeLimits"] || changes["dailyUsage"] || changes["siteExtensions"]) {
      updateBadgeForTab(__activeTabId, __activeUrl);
    }

    const syncTriggers = [
      "blocked",
      "mode",
      "timeLimits",
      "challengePhrase",
      "challengeRepeatCount",
      "schedule",
      "resolution",
      "redirectUrl",
      "disableDelay",
      "blockByTitle",
    ];

    if (syncTriggers.some((k) => changes[k])) {
      triggerDebouncedPush();
    }
  });
});

// Periodic background sync pull every 10 minutes
setInterval(pullRemoteSync, 10 * 60 * 1000);

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

// Update toolbar icon badge with remaining time for the tab
const updateBadgeForTab = (tabId?: number | null, url?: string | null) => {
  if (!tabId || !url || !url.startsWith("http")) {
    if (tabId) {
      chrome.action.setBadgeText({ text: "", tabId });
    }
    return;
  }

  const host = normalizeHost(url);
  const limitMinutes = __timeLimits[host];

  if (!limitMinutes || limitMinutes <= 0) {
    chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  if (isSiteExtensionActive(host, __siteExtensions)) {
    chrome.action.setBadgeText({ text: "EXT", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId });
    return;
  }

  const { remainingSeconds } = getTimeRemaining(host, __timeLimits, __dailyUsage);

  if (remainingSeconds <= 0) {
    chrome.action.setBadgeText({ text: "0m", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId });
  } else if (remainingSeconds < 60) {
    chrome.action.setBadgeText({ text: `${remainingSeconds}s`, tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId });
  } else {
    const mins = Math.ceil(remainingSeconds / 60);
    chrome.action.setBadgeText({ text: `${mins}m`, tabId });
    if (mins <= 5) {
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b", tabId });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: "#3b82f6", tabId });
    }
  }
};

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
      updateBadgeForTab(__activeTabId, __activeUrl);
    });
  });
}

if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === __activeTabId && (changeInfo.url || changeInfo.status === "complete")) {
      __activeUrl = tab.url || __activeUrl;
      updateBadgeForTab(__activeTabId, __activeUrl);
    }
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
  updateBadgeForTab(__activeTabId, __activeUrl);

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
