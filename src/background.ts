import initStorage from "./storage/init";
import storage from "./storage";
import recreateContextMenu from "./helpers/recreate-context-menu";
import scrollTax from "./helpers/scroll-tax";
import { isPaused } from "./helpers/pause";
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
let __pausedUntil: number | null = null;
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
let __popupOpenCount = 0;
let __lastTickAt = 0;

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
    "pausedUntil",
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
    pausedUntil,
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
    __pausedUntil = pausedUntil || null;
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

    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          __activeTabId = tabs[0].id ?? null;
          __activeUrl = tabs[0].url || null;
          updateBadgeForTab(__activeTabId, __activeUrl);
        }
      });
    }
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes["enabled"]) {
      __enabled = changes["enabled"].newValue as boolean;
    }

    if (changes["pausedUntil"]) {
      __pausedUntil = (changes["pausedUntil"].newValue as number | null) || null;
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
  if (isSiteExtensionActive(host, __siteExtensions)) {
    chrome.action.setBadgeText({ text: "EXT", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId });
    return;
  }

  const limitMinutes = __timeLimits[host];

  if (!limitMinutes || limitMinutes <= 0) {
    chrome.action.setBadgeText({ text: "", tabId });
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

// Track popup open state so focus loss to the extension popup never halts the 5-second timer
if (chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
      __popupOpenCount += 1;
      __windowFocused = true;
      port.onDisconnect.addListener(() => {
        __popupOpenCount = Math.max(0, __popupOpenCount - 1);
        if (chrome.windows && chrome.windows.getLastFocused) {
          chrome.windows.getLastFocused((win) => {
            __windowFocused = Boolean(win?.focused);
          });
        }
      });
    }
  });
}

// Track active window focus
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (__popupOpenCount > 0 && windowId === chrome.windows.WINDOW_ID_NONE) {
      // Popup window took focus from browser window; keep counting active tab usage
      __windowFocused = true;
      return;
    }
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

const tickTimeUsage = async (forceTab?: { tabId?: number; url?: string }) => {
  const now = Date.now();
  if (now - __lastTickAt < 4500) {
    return;
  }

  if (__enabled === undefined) {
    const s = await storage.get(["enabled", "pausedUntil", "timeLimits", "dailyUsage", "siteExtensions"]);
    __enabled = s.enabled;
    __pausedUntil = s.pausedUntil || null;
    __timeLimits = s.timeLimits || {};
    __dailyUsage = s.dailyUsage || {};
    __siteExtensions = s.siteExtensions || {};
  }

  if (!__enabled || isPaused(__pausedUntil)) {
    return;
  }

  let tabId = forceTab?.tabId ?? __activeTabId;
  let url = forceTab?.url || __activeUrl;
  let isFocused = Boolean(forceTab) || __popupOpenCount > 0 || __windowFocused;

  if (!forceTab && __popupOpenCount === 0 && chrome.windows && chrome.windows.getLastFocused) {
    try {
      const win = await new Promise<chrome.windows.Window | undefined>((resolve) => {
        chrome.windows.getLastFocused((w) => resolve(w));
      });
      if (win) {
        isFocused = Boolean(win.focused);
        __windowFocused = isFocused;
      }
    } catch {
      // Fallback to __windowFocused
    }
  }

  if (!isFocused) {
    return;
  }

  if (!forceTab && chrome.tabs && chrome.tabs.query) {
    try {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (res) => resolve(res || []));
      });
      if (tabs && tabs[0]) {
        tabId = tabs[0].id ?? tabId;
        url = tabs[0].url || url;
        __activeTabId = tabId;
        __activeUrl = url;
      }
    } catch {
      // Fallback to cached __activeTabId / __activeUrl
    }
  }

  if (!tabId || !url || !url.startsWith("http")) {
    return;
  }

  const host = normalizeHost(url);

  // If a Mirror of Accountability extension on this host just expired, clean it up and re-evaluate blocking
  if (__siteExtensions[host] && __siteExtensions[host] <= now) {
    const updatedExtensions = { ...__siteExtensions };
    delete updatedExtensions[host];
    __siteExtensions = updatedExtensions;
    await storage.set({ siteExtensions: __siteExtensions });
    updateBadgeForTab(tabId, url);
    scrollTax({ blocked: __blocked || [], tabId, url });
  }

  if (!__timeLimits[host]) {
    return;
  }

  __lastTickAt = now;

  // Increment usage by 5 seconds
  __dailyUsage = recordTimeUsage(host, 5, __dailyUsage);
  await storage.set({ dailyUsage: __dailyUsage });
  updateBadgeForTab(tabId, url);

  if (hasExceededTimeLimit(host, __timeLimits, __dailyUsage, __siteExtensions)) {
    scrollTax({
      blocked: [host],
      tabId,
      url,
      reason: `Daily Limit Exceeded (${__timeLimits[host]} min)`,
    });
  }
};

// Periodic heartbeat: tracks time limits every 5 seconds for the active focused tab
setInterval(() => {
  tickTimeUsage().catch((err) => console.warn("Error in tickTimeUsage:", err));
}, 5000);

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "TICK_TIME_USAGE") {
      tickTimeUsage({ tabId: message.tabId, url: message.url })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  });
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!__enabled) {
    return;
  }

  const { tabId, url, frameId } = details;
  if (!url || !url.startsWith("http") || frameId !== 0) {
    return;
  }

  scrollTax({ blocked: __blocked || [], tabId, url });
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

  const title = changeInfo.title || tab?.title;
  scrollTax({ blocked: __blocked || [], tabId, url, title });
});
