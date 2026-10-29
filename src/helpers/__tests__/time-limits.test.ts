import {
  normalizeHost,
  getTodayKey,
  isSiteExtensionActive,
  hasExceededTimeLimit,
  recordTimeUsage,
  getTimeRemaining,
} from "../time-limits";

describe("time-limits helper", () => {
  const fixedNow = 1700000000000;
  const fixedDate = new Date(fixedNow); // 2023-11-14

  describe("normalizeHost()", () => {
    it("extracts clean host from full URLs, www, and ports", () => {
      expect(normalizeHost("https://www.youtube.com/watch?v=123")).toBe("youtube.com");
      expect(normalizeHost("http://reddit.com/r/all")).toBe("reddit.com");
      expect(normalizeHost("www.twitter.com:8080/home")).toBe("twitter.com");
      expect(normalizeHost("GITHUB.COM")).toBe("github.com");
    });
  });

  describe("getTodayKey()", () => {
    it("formats date as YYYY-MM-DD", () => {
      const d = new Date(2026, 9, 29); // Month is 0-indexed: 9 = Oct
      expect(getTodayKey(d)).toBe("2026-10-29");
    });
  });

  describe("isSiteExtensionActive()", () => {
    it("returns true when extension is in the future", () => {
      const extensions = { "youtube.com": fixedNow + 60000 };
      expect(isSiteExtensionActive("https://www.youtube.com", extensions, fixedNow)).toBe(true);
    });

    it("returns false when extension has expired or does not exist", () => {
      const extensions = { "youtube.com": fixedNow - 1000 };
      expect(isSiteExtensionActive("youtube.com", extensions, fixedNow)).toBe(false);
      expect(isSiteExtensionActive("reddit.com", extensions, fixedNow)).toBe(false);
    });
  });

  describe("hasExceededTimeLimit()", () => {
    const today = getTodayKey(fixedDate);
    const timeLimits = { "youtube.com": 15 }; // 15 minutes = 900 seconds

    it("returns false if site has no time limit", () => {
      expect(hasExceededTimeLimit("reddit.com", timeLimits, {}, {}, fixedNow, fixedDate)).toBe(false);
    });

    it("returns false if usage is below limit", () => {
      const usage = { [today]: { "youtube.com": 800 } };
      expect(hasExceededTimeLimit("youtube.com", timeLimits, usage, {}, fixedNow, fixedDate)).toBe(false);
    });

    it("returns true if usage meets or exceeds limit", () => {
      const usage = { [today]: { "youtube.com": 900 } };
      expect(hasExceededTimeLimit("youtube.com", timeLimits, usage, {}, fixedNow, fixedDate)).toBe(true);

      const overUsage = { [today]: { "youtube.com": 1200 } };
      expect(hasExceededTimeLimit("youtube.com", timeLimits, overUsage, {}, fixedNow, fixedDate)).toBe(true);
    });

    it("returns false if active extension exists even if over limit", () => {
      const usage = { [today]: { "youtube.com": 1200 } };
      const extensions = { "youtube.com": fixedNow + 300000 };
      expect(hasExceededTimeLimit("youtube.com", timeLimits, usage, extensions, fixedNow, fixedDate)).toBe(false);
    });
  });

  describe("recordTimeUsage()", () => {
    it("records increments into daily usage dictionary", () => {
      const initial = {};
      const step1 = recordTimeUsage("youtube.com", 15, initial, fixedDate);
      const today = getTodayKey(fixedDate);

      expect(step1[today]["youtube.com"]).toBe(15);

      const step2 = recordTimeUsage("www.youtube.com", 30, step1, fixedDate);
      expect(step2[today]["youtube.com"]).toBe(45);
    });
  });

  describe("getTimeRemaining()", () => {
    it("computes remaining seconds accurately", () => {
      const today = getTodayKey(fixedDate);
      const timeLimits = { "reddit.com": 10 }; // 600s
      const usage = { [today]: { "reddit.com": 150 } };

      const res = getTimeRemaining("reddit.com", timeLimits, usage, fixedDate);
      expect(res.limitSeconds).toBe(600);
      expect(res.usedSeconds).toBe(150);
      expect(res.remainingSeconds).toBe(450);
    });
  });
});
