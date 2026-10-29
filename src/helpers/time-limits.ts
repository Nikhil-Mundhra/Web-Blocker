export const normalizeHost = (urlOrHost: string): string => {
  try {
    const raw = urlOrHost.startsWith("http://") || urlOrHost.startsWith("https://")
      ? new URL(urlOrHost).hostname
      : urlOrHost.split("/")[0].split(":")[0];
    return raw.replace(/^www\./, "").toLowerCase().trim();
  } catch {
    return urlOrHost.toLowerCase().trim();
  }
};

export const getTodayKey = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isSiteExtensionActive = (
  domain: string,
  siteExtensions: Record<string, number> = {},
  now: number = Date.now(),
): boolean => {
  const norm = normalizeHost(domain);
  const expiration = siteExtensions[norm];
  return typeof expiration === "number" && expiration > now;
};

export const hasExceededTimeLimit = (
  domain: string,
  timeLimits: Record<string, number> = {},
  dailyUsage: Record<string, Record<string, number>> = {},
  siteExtensions: Record<string, number> = {},
  now: number = Date.now(),
  date: Date = new Date(now),
): boolean => {
  const norm = normalizeHost(domain);
  const limitMinutes = timeLimits[norm];
  if (typeof limitMinutes !== "number" || limitMinutes <= 0) {
    return false;
  }

  // Active extension overrides limit
  if (isSiteExtensionActive(norm, siteExtensions, now)) {
    return false;
  }

  const todayKey = getTodayKey(date);
  const usedSeconds = dailyUsage[todayKey]?.[norm] || 0;
  return usedSeconds >= limitMinutes * 60;
};

export const recordTimeUsage = (
  domain: string,
  seconds: number,
  dailyUsage: Record<string, Record<string, number>> = {},
  date: Date = new Date(),
): Record<string, Record<string, number>> => {
  const norm = normalizeHost(domain);
  const todayKey = getTodayKey(date);
  const currentUsageForToday = { ...(dailyUsage[todayKey] || {}) };
  const currentSeconds = currentUsageForToday[norm] || 0;

  return {
    ...dailyUsage,
    [todayKey]: {
      ...currentUsageForToday,
      [norm]: currentSeconds + Math.max(0, seconds),
    },
  };
};

export const getTimeRemaining = (
  domain: string,
  timeLimits: Record<string, number> = {},
  dailyUsage: Record<string, Record<string, number>> = {},
  date: Date = new Date(),
): { limitSeconds: number; usedSeconds: number; remainingSeconds: number } => {
  const norm = normalizeHost(domain);
  const limitMinutes = timeLimits[norm] || 0;
  const limitSeconds = limitMinutes * 60;
  const todayKey = getTodayKey(date);
  const usedSeconds = dailyUsage[todayKey]?.[norm] || 0;
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds,
  };
};
