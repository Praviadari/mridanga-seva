// The daily practice reminder in the browser: none (docs/DECISIONS.md #402). Metro uses this file instead of
// ./practice-reminder.ts on the web: a closed web page cannot show a notification at a time without web push, a
// separate project. Practice tools says reminders work in the Android app.

import type { ReminderTime } from './reminder-days';

export { REMINDER_TIMES, type ReminderTime } from './reminder-days';

/** No reminders in the browser. */
export const remindersPossible = false;

/** Always off on the web. `profileId` matches ./practice-reminder.ts. */
export function readReminder(profileId: string): ReminderTime | null {
  void profileId;
  return null;
}

/** Does nothing on the web. */
export async function setReminder(profileId: string, time: ReminderTime | null): Promise<'on' | 'off' | 'denied' | 'failed'> {
  void profileId;
  return time === null ? 'off' : 'failed';
}

/** Does nothing on the web. */
export async function refreshReminder(profileId: string): Promise<void> {
  void profileId;
}

/** Does nothing on the web. */
export async function notePractisedToday(profileId: string, day?: string): Promise<void> {
  void profileId;
  void day;
}

/** Does nothing on the web. */
export async function forgetPracticeReminders(): Promise<void> {}
