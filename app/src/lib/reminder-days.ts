// The days and times of the daily practice reminder (lib/practice-reminder.ts, docs/DECISIONS.md #402), apart from
// expo-notifications so the rule can be tested.

import { addDays } from './dates';

/** A time of day at the class, 24-hour 'HH:MM' as the app shows times. */
export type ReminderTime = string;

/** The times offered: before school and after it (chips, not a clock, for children). */
export const REMINDER_TIMES: readonly ReminderTime[] = ['06:30', '07:30', '17:00', '18:00', '19:00', '20:00'];

/** How many days ahead are scheduled. */
export const REMINDER_DAYS = 14;

/** The days to remind on, from today: today left out when the student has practised today. */
export function reminderDays(today: string, practisedToday: boolean): string[] {
  return Array.from({ length: REMINDER_DAYS }, (_, i) => addDays(today, i)).slice(practisedToday ? 1 : 0);
}
