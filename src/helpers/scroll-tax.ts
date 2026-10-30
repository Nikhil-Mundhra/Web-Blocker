import storage from "../storage";
import findRule from "./find-rule";
import * as counterHelper from "./counter";
import getBlockedUrl from "./get-blocked-url";
import { isScheduleActive } from "./schedule";
import { isPaused } from "./pause";
import {
  normalizeHost,
  isSiteExtensionActive,
  hasExceededTimeLimit,
} from "./time-limits";

interface ScrollTaxOptions {
  blocked: string[]
  tabId: number
  url: string
  title?: string
  reason?: string
}

const isDomainLevelRuleForHost = (rulePath: string, host: string): boolean => {
  const cleaned = rulePath
    .toLowerCase()
    .trim()
    .replace(/^\*\./, "")
    .replace(/^www\./, "")
    .replace(/\/\*?$/, "");
  return cleaned === host;
};

// Track recent block timestamps per tab to prevent rapid duplicate actions during multi-hop redirects
const recentBlockedTabs = new Map<number, number>();

export default (options: ScrollTaxOptions) => {
  const { blocked, tabId, url, title, reason } = options;
  if (!tabId || !url.startsWith("http")) {
    return;
  }

  const now = Date.now();
  const lastBlockedTime = recentBlockedTabs.get(tabId);
  if (lastBlockedTime && now - lastBlockedTime < 500) {
    return;
  }

  storage.get([
    "counter",
    "counterShow",
    "counterPeriod",
    "resolution",
    "redirectUrl",
    "mode",
    "schedule",
    "pausedUntil",
    "timeLimits",
    "dailyUsage",
    "siteExtensions",
  ]).then(({
    counter,
    counterShow,
    counterPeriod,
    resolution,
    redirectUrl,
    mode,
    schedule,
    pausedUntil,
    timeLimits = {},
    dailyUsage = {},
    siteExtensions = {},
  }) => {
    // 1. If currently paused (e.g. 1-minute break), allow navigation
    if (isPaused(pausedUntil, now)) {
      return;
    }

    // 2. If schedule is configured and current time is outside active schedule, allow navigation
    if (!isScheduleActive(schedule)) {
      return;
    }

    const host = normalizeHost(url);

    // 3. If user earned an active Mirror of Accountability extension for this domain, allow navigation
    if (host && isSiteExtensionActive(host, siteExtensions, now)) {
      return;
    }

    const hasTimeLimit = Boolean(host && typeof timeLimits[host] === "number" && timeLimits[host] > 0);
    const limitExceeded = hasTimeLimit && hasExceededTimeLimit(host, timeLimits, dailyUsage, siteExtensions, now);

    const foundRule = findRule(url, blocked, title);

    // 4. Determine if site should be blocked based on time limits + block/allow mode
    let shouldBlock = false;
    let effectiveRulePath = reason || foundRule?.path || "[Approved Sites Only]";

    if (reason || limitExceeded) {
      shouldBlock = true;
      effectiveRulePath = reason || `Daily Limit Exceeded (${timeLimits[host]} min)`;
    } else if (mode === "WHITELIST") {
      // In Whitelist mode, explicitly allowed rules OR domains with active remaining Daily Time Limits are permitted
      if ((foundRule && foundRule.type === "allow") || (hasTimeLimit && !limitExceeded)) {
        shouldBlock = false;
      } else {
        shouldBlock = true;
        if (!foundRule) {
          effectiveRulePath = "Approved Sites Only";
        }
      }
    } else {
      // Standard BLOCKLIST mode
      if (!foundRule || foundRule.type === "allow") {
        shouldBlock = false;
      } else if (hasTimeLimit && !limitExceeded && isDomainLevelRuleForHost(foundRule.path, host)) {
        // Domain has remaining Daily Time Limit budget: defer domain-wide block until budget is used,
        // while still allowing sub-path/title rules (e.g. youtube.com/shorts*) to block immediately.
        shouldBlock = false;
      } else {
        shouldBlock = true;
      }
    }

    if (!shouldBlock) {
      counterHelper.flushObsoleteEntries({ blocked, counter });
      storage.set({ counter });
      return;
    }

    recentBlockedTabs.set(tabId, now);

    counterHelper.flushObsoleteEntries({ blocked, counter });
    const count = counterHelper.add(effectiveRulePath, now, {
      counter,
      countFromTimeStamp: counterHelper.counterPeriodToTimeStamp(counterPeriod, now),
    });
    storage.set({ counter });

    switch (resolution) {
    case "CLOSE_TAB":
      try {
        const removeResult = chrome.tabs.remove(tabId);
        if (removeResult && typeof removeResult.catch === "function") {
          removeResult.catch(() => {});
        }
      } catch {
        // Tab may have already been closed
      }
      break;

    case "REDIRECT": {
      const target = (redirectUrl && redirectUrl.trim()) || "https://www.google.com";
      const finalUrl = target.startsWith("http://") || target.startsWith("https://")
        ? target
        : `https://${target}`;

      try {
        const updateResult = chrome.tabs.update(tabId, { url: finalUrl });
        if (updateResult && typeof updateResult.catch === "function") {
          updateResult.catch(() => {});
        }
      } catch {
        // Ignore if tab cannot be updated
      }
      break;
    }

    case "SHOW_BLOCKED_INFO_PAGE": {
      const commonUpdateProperties = {
        url: getBlockedUrl({
          url,
          rule: effectiveRulePath,
          countParams: counterShow ? { count, period: counterPeriod } : undefined,
        }),
      };

      try {
        if (process.env.TARGET === "chrome") {
          const updateResult = chrome.tabs.update(tabId, commonUpdateProperties);
          if (updateResult && typeof updateResult.catch === "function") {
            updateResult.catch(() => {});
          }
          break;
        }

        if (process.env.TARGET === "firefox") {
          const updateResult = browser.tabs.update(tabId, { ...commonUpdateProperties, loadReplace: true });
          if (updateResult && typeof updateResult.catch === "function") {
            updateResult.catch(() => {});
          }
          break;
        }
      } catch {
        // Ignore if tab cannot be updated
      }
    }}
  });
};