import { isScheduleActive } from "../schedule";
import { Schedule } from "../../storage/schema";

describe("isScheduleActive()", () => {
  const baseSchedule: Schedule = {
    enabled: true,
    days: [1, 2, 3, 4, 5], // Monday - Friday
    startTime: "09:00",
    endTime: "17:00",
  };

  it("returns true when schedule is disabled regardless of time", () => {
    const disabledSchedule: Schedule = { ...baseSchedule, enabled: false };
    const sundayNight = new Date("2026-10-25T23:00:00"); // Sunday
    expect(isScheduleActive(disabledSchedule, sundayNight)).toBe(true);
  });

  it("returns false on days outside scheduled days", () => {
    const sundayMidday = new Date("2026-10-25T12:00:00"); // Sunday (0)
    const saturdayMidday = new Date("2026-10-31T12:00:00"); // Saturday (6)
    expect(isScheduleActive(baseSchedule, sundayMidday)).toBe(false);
    expect(isScheduleActive(baseSchedule, saturdayMidday)).toBe(false);
  });

  it("returns true during scheduled hours on scheduled days", () => {
    const mondayMorning = new Date("2026-10-26T09:00:00"); // Monday at 9am
    const wednesdayLunch = new Date("2026-10-28T12:30:00"); // Wednesday at 12:30pm
    const fridayAfternoon = new Date("2026-10-30T17:00:00"); // Friday at 5pm

    expect(isScheduleActive(baseSchedule, mondayMorning)).toBe(true);
    expect(isScheduleActive(baseSchedule, wednesdayLunch)).toBe(true);
    expect(isScheduleActive(baseSchedule, fridayAfternoon)).toBe(true);
  });

  it("returns false before or after scheduled hours on scheduled days", () => {
    const mondayEarly = new Date("2026-10-26T08:59:00"); // Monday 8:59am
    const fridayEvening = new Date("2026-10-30T17:01:00"); // Friday 5:01pm

    expect(isScheduleActive(baseSchedule, mondayEarly)).toBe(false);
    expect(isScheduleActive(baseSchedule, fridayEvening)).toBe(false);
  });

  describe("overnight schedule (e.g. 22:00 - 06:00)", () => {
    const overnightSchedule: Schedule = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startTime: "22:00",
      endTime: "06:00",
    };

    it("returns true late at night before midnight", () => {
      const tuesdayLate = new Date("2026-10-27T23:30:00");
      expect(isScheduleActive(overnightSchedule, tuesdayLate)).toBe(true);
    });

    it("returns true early in the morning after midnight", () => {
      const wednesdayEarly = new Date("2026-10-28T04:15:00");
      expect(isScheduleActive(overnightSchedule, wednesdayEarly)).toBe(true);
    });

    it("returns false during midday", () => {
      const wednesdayMidday = new Date("2026-10-28T14:00:00");
      expect(isScheduleActive(overnightSchedule, wednesdayMidday)).toBe(false);
    });
  });
});