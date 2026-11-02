// The rules of the morning wake-up alarm (lib/wake-alarm.ts, docs/DECISIONS.md #791-#792), apart from
// expo-notifications so they can be tested: what a saved alarm looks like, which days and times are allowed, when it
// rings next and the weekday numbers Android's weekly trigger wants. Times are the phone's own clock (an alarm rings
// at 05:00 where the phone is), not the class's time zone.

/** A day of the week as JavaScript counts it: 0 Sunday ... 6 Saturday. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The alarm one login set on this phone. */
export type WakeAlarm = {
  /** 24-hour 'HH:MM'. */
  time: string;
  /** The days it rings, at least one, in the order Monday first. */
  days: WeekDay[];
  /** Minutes until it rings again after Snooze. */
  snooze: number;
};

/** The days in the order the screen shows them: Monday first, as the class's week (#400). */
export const WEEK_DAYS: readonly WeekDay[] = [1, 2, 3, 4, 5, 6, 0];

/** Snooze lengths offered, in minutes. */
export const SNOOZE_CHOICES: readonly number[] = [5, 10, 15];

/** What the screen offers before anything is saved: 05:00 every day, 10 minutes' snooze. */
export const DEFAULT_WAKE_ALARM: WakeAlarm = { time: '05:00', days: [...WEEK_DAYS], snooze: 10 };

/** True for a 24-hour 'HH:MM' from 00:00 to 23:59. */
export function isAlarmTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/** 'HH:MM' of a picked hour and minute. */
export function alarmTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The days in screen order, each once; anything else dropped. */
export function orderDays(days: readonly number[]): WeekDay[] {
  return WEEK_DAYS.filter((d) => days.includes(d));
}

/** A saved alarm as written by setWakeAlarm, or null when it is not this login's or not a valid alarm. */
export function parseSavedAlarm(text: string | null, profileId: string): WakeAlarm | null {
  try {
    const saved = JSON.parse(text ?? 'null') as ({ profileId?: unknown } & Partial<WakeAlarm>) | null;
    if (!saved || saved.profileId !== profileId || typeof saved.time !== 'string' || !isAlarmTime(saved.time)) return null;
    const days = Array.isArray(saved.days) ? orderDays(saved.days) : [];
    const snooze = typeof saved.snooze === 'number' && SNOOZE_CHOICES.includes(saved.snooze) ? saved.snooze : DEFAULT_WAKE_ALARM.snooze;
    return days.length > 0 ? { time: saved.time, days, snooze } : null;
  } catch {
    return null;
  }
}

/** Android's weekly trigger counts 1 Sunday ... 7 Saturday (expo-notifications WeeklyTriggerInput). */
export function triggerWeekday(day: WeekDay): number {
  return day + 1;
}

/** The next moment the alarm rings after `now` (the phone's clock), or null with no days. */
export function nextRing(alarm: WakeAlarm, now: Date): Date | null {
  if (alarm.days.length === 0 || !isAlarmTime(alarm.time)) return null;
  const [hour, minute] = alarm.time.split(':').map(Number);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour, minute, 0, 0);
    if (at.getTime() > now.getTime() && alarm.days.includes(at.getDay() as WeekDay)) return at;
  }
  return null;
}

/** When a snoozed alarm rings again: `minutes` after `now`, on the minute's start so it reads as a clock time. */
export function snoozeUntil(now: Date, minutes: number): Date {
  const at = new Date(now.getTime() + minutes * 60_000);
  at.setSeconds(0, 0);
  return at.getTime() > now.getTime() ? at : new Date(now.getTime() + minutes * 60_000);
}
