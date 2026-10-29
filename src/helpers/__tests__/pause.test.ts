import { isPaused, getRemainingPauseSeconds, createPauseTimestamp } from "../pause";

describe("pause helper", () => {
  const fixedNow = 1700000000000;

  describe("isPaused()", () => {
    it("returns false if pausedUntil is null or invalid", () => {
      expect(isPaused(null, fixedNow)).toBe(false);
    });

    it("returns false if pausedUntil has elapsed", () => {
      expect(isPaused(fixedNow - 1000, fixedNow)).toBe(false);
      expect(isPaused(fixedNow, fixedNow)).toBe(false);
    });

    it("returns true if pausedUntil is in the future", () => {
      expect(isPaused(fixedNow + 60000, fixedNow)).toBe(true);
    });
  });

  describe("getRemainingPauseSeconds()", () => {
    it("returns 0 if not paused", () => {
      expect(getRemainingPauseSeconds(null, fixedNow)).toBe(0);
      expect(getRemainingPauseSeconds(fixedNow - 1000, fixedNow)).toBe(0);
    });

    it("returns ceiling seconds remaining", () => {
      expect(getRemainingPauseSeconds(fixedNow + 59100, fixedNow)).toBe(60);
      expect(getRemainingPauseSeconds(fixedNow + 20000, fixedNow)).toBe(20);
    });
  });

  describe("createPauseTimestamp()", () => {
    it("calculates future timestamp from minutes", () => {
      expect(createPauseTimestamp(1, fixedNow)).toBe(fixedNow + 60 * 1000);
      expect(createPauseTimestamp(5, fixedNow)).toBe(fixedNow + 5 * 60 * 1000);
    });
  });
});