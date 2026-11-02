// The wake-up alarm in the browser: none (docs/DECISIONS.md #791). Metro uses this file instead of ./wake-alarm.ts
// on the web: a closed web page cannot ring at a time by itself, and a browser plays only its own notification sound.
// Practice tools says the alarm works in the Android app.

import type { WakeAlarm } from './wake-alarm-rules';

export {
  DEFAULT_WAKE_ALARM,
  SNOOZE_CHOICES,
  WEEK_DAYS,
  alarmTime,
  nextRing,
  type WakeAlarm,
  type WeekDay,
} from './wake-alarm-rules';

/** No alarm in the browser. */
export const wakeAlarmPossible = false;

/** No "Alarms & reminders" setting in the browser. */
export const exactAlarmSetting = false;

/** Always off on the web. `profileId` matches ./wake-alarm.ts. */
export function readWakeAlarm(profileId: string): WakeAlarm | null {
  void profileId;
  return null;
}

/** Does nothing on the web. */
export async function setWakeAlarm(profileId: string, alarm: WakeAlarm | null, url: string): Promise<'on' | 'off' | 'denied' | 'failed'> {
  void profileId;
  void url;
  return alarm === null ? 'off' : 'failed';
}

/** Does nothing on the web. */
export async function refreshWakeAlarm(profileId: string): Promise<void> {
  void profileId;
}

/** Does nothing on the web. */
export async function forgetWakeAlarm(): Promise<void> {}

/** Does nothing on the web. */
export async function openExactAlarmSetting(): Promise<void> {}
