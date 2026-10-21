// The daily practice reminder (docs/DECISIONS.md #402), Android app only: the student picks a time on Practice tools
// and the phone itself shows "Practice time" then each day, with no server and nothing sent anywhere. Off until
// chosen. It uses expo-notifications, already in the APK (lib/push.ts loads it), and only one-off notifications: the
// next 14 days are scheduled, without today once the student has practised today on this phone or the time has
// passed. So a child who practised is not reminded, and a phone left unused stops reminding after two weeks. Every
// visit to Practice tools and every practice saved schedules the 14 days again. Android without the exact-alarm right
// shows it within some minutes of the time. Kept per login on this device; every sign-out removes it
// (lib/device-traces.ts), so the next person on a shared phone gets no reminder of someone else's.
// The browser version is practice-reminder.web.ts: no reminders (web push for iPhone is a separate project).

import { Platform } from 'react-native';

import i18n from '@/i18n';

import { localMoment, todayLocal } from './dates';
import { readLocal, removeLocal, writeLocal } from './local-storage';
import { notifications } from './push';
import { reminderDays, type ReminderTime } from './reminder-days';

export { REMINDER_TIMES, type ReminderTime } from './reminder-days';

const KEY = 'practiceReminder';
const PRACTISED_KEY = 'practisedToday';
const CHANNEL_ID = 'practice';
const KIND = 'practiceReminder';

type Saved = { profileId: string; time: ReminderTime };

/** True where reminders can work: the Android app. */
export const remindersPossible = Platform.OS === 'android';

/** The reminder time this login chose on this phone, or null (off). */
export function readReminder(profileId: string): ReminderTime | null {
  try {
    const saved = JSON.parse(readLocal(KEY) ?? 'null') as Saved | null;
    return saved && saved.profileId === profileId && /^\d{2}:\d{2}$/.test(saved.time) ? saved.time : null;
  } catch {
    return null;
  }
}

/** True when this login saved practice today on this phone. */
function practisedToday(profileId: string): boolean {
  try {
    const saved = JSON.parse(readLocal(PRACTISED_KEY) ?? 'null') as { profileId: string; on: string } | null;
    return saved?.profileId === profileId && saved.on === todayLocal();
  } catch {
    return false;
  }
}

/** Removes this app's practice reminders from the phone's schedule. */
async function cancelScheduled(): Promise<void> {
  const module = await notifications();
  if (!module) return;
  try {
    const scheduled = await module.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content.data?.kind === KIND)
        .map((n) => module.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Nothing scheduled, or the schedule cannot be read: nothing to remove.
  }
}

/** Schedules the next days' reminders at `time`. 'denied' = notifications are off for the app. */
async function schedule(profileId: string, time: ReminderTime): Promise<'on' | 'denied' | 'failed'> {
  const module = await notifications();
  if (!module) return 'failed';
  try {
    await module.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('practice.reminderChannel'),
      importance: module.AndroidImportance.DEFAULT,
    });
    const current = await module.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) status = (await module.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    await cancelScheduled();
    for (const day of reminderDays(todayLocal(), practisedToday(profileId))) {
      const at = new Date(localMoment(day, time));
      if (at.getTime() <= Date.now()) continue; // today's time has passed
      await module.scheduleNotificationAsync({
        content: {
          title: i18n.t('practice.reminderTitle'),
          body: i18n.t('practice.reminderBody'),
          data: { kind: KIND, url: '/student/practice' },
        },
        trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
      });
    }
    return 'on';
  } catch {
    return 'failed';
  }
}

/**
 * Turns the reminder on at `time`, or off with null. Asks for the notification permission when needed (Android 13
 * and later). 'denied' and 'failed' leave it off.
 */
export async function setReminder(profileId: string, time: ReminderTime | null): Promise<'on' | 'off' | 'denied' | 'failed'> {
  if (time === null) {
    removeLocal(KEY);
    await cancelScheduled();
    return 'off';
  }
  const result = await schedule(profileId, time);
  if (result === 'on') writeLocal(KEY, JSON.stringify({ profileId, time } satisfies Saved));
  return result;
}

/** Schedules the next 14 days again when this login has a reminder (Practice tools in view, practice saved). */
export async function refreshReminder(profileId: string): Promise<void> {
  const time = readReminder(profileId);
  if (time && remindersPossible) await schedule(profileId, time);
}

/** Notes that this login practised today on this phone (no reminder today), then schedules again. */
export async function notePractisedToday(profileId: string, day: string = todayLocal()): Promise<void> {
  if (day !== todayLocal()) return;
  writeLocal(PRACTISED_KEY, JSON.stringify({ profileId, on: day }));
  await refreshReminder(profileId);
}

/** At sign-out: no reminder stays scheduled for the next person on this phone. */
export async function forgetPracticeReminders(): Promise<void> {
  removeLocal(KEY);
  removeLocal(PRACTISED_KEY);
  await cancelScheduled();
}
