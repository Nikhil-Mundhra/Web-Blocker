import { Schedule } from "../storage/schema";

export const isScheduleActive = (schedule: Schedule, now: Date = new Date()): boolean => {
  if (!schedule.enabled) {
    return true;
  }

  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  if (!schedule.days.includes(currentDay)) {
    return false;
  }

  const [startHour, startMin] = schedule.startTime.split(":").map(Number);
  const [endHour, endMin] = schedule.endTime.split(":").map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (isNaN(startHour) ? 0 : startHour) * 60 + (isNaN(startMin) ? 0 : startMin);
  const endMinutes = (isNaN(endHour) ? 23 : endHour) * 60 + (isNaN(endMin) ? 59 : endMin);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Overnight schedule spanning midnight (e.g. 22:00 to 06:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
};