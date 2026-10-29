export const isPaused = (pausedUntil: number | null, now: number = Date.now()): boolean => {
  if (typeof pausedUntil !== "number") {
    return false;
  }
  return pausedUntil > now;
};

export const getRemainingPauseSeconds = (pausedUntil: number | null, now: number = Date.now()): number => {
  if (typeof pausedUntil !== "number" || pausedUntil <= now) {
    return 0;
  }
  return Math.ceil((pausedUntil - now) / 1000);
};

export const createPauseTimestamp = (minutes: number, now: number = Date.now()): number => {
  return now + Math.max(0, minutes) * 60 * 1000;
};