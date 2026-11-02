// The morning wake-up alarm (docs/DECISIONS.md #791-#794), Android app only: a time, the days of the week and a
// snooze length on Practice tools; the phone itself rings then with the class's khol (khol_wake.wav, about 27
// seconds, made by scripts/make-khol-alarm-sounds.mjs from the #790 recordings), with Stop and Snooze on the
// notification. Nothing is sent anywhere.
// - One weekly local notification per chosen day (expo-notifications' weekly trigger): Android repeats it by itself
//   every week and sets it again after a restart, so the alarm goes on without the app being opened. Every visit to
//   Practice tools schedules it again (new wording after a language switch, and a repair if a phone's battery saver
//   dropped it).
// - Its own channel, "wake-alarm-khol": the khol sound, alarm audio usage (the alarm volume, which silent mode does
//   not mute on most phones), the highest importance, allowed through Do not disturb where the person lets it. A
//   channel's sound is fixed when Android creates it, so a new sound needs a new channel id (OPERATIONS).
// - Exact time needs Android's "Alarms & reminders" right (SCHEDULE_EXACT_ALARM, app.json): without it Android may
//   ring some minutes late. The app cannot read whether it is on, so the screen explains it and opens the setting.
// - Stop and Snooze work with the app closed: lib/wake-alarm-task.ts runs them in the background (expo-task-manager,
//   loaded by src/entry.ts); while the app runs, the listener below does. Stop (or a tap, which also opens Practice
//   tools) silences it and drops a pending snooze; Snooze silences it and rings again after the chosen minutes.
// - Kept per login on this device; every sign-out removes it (lib/device-traces.ts), as the practice reminder (#402).
// The browser version is wake-alarm.web.ts: no alarm.

import { Linking, Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';

import i18n from '@/i18n';

import { readLocal, removeLocal, writeLocal } from './local-storage';
import { notifications } from './push';
import { parseSavedAlarm, snoozeUntil, triggerWeekday, type WakeAlarm } from './wake-alarm-rules';
import { WAKE_ALARM_TASK } from './wake-alarm-task';

export {
  DEFAULT_WAKE_ALARM,
  SNOOZE_CHOICES,
  WEEK_DAYS,
  alarmTime,
  nextRing,
  type WakeAlarm,
  type WeekDay,
} from './wake-alarm-rules';

type Notifications = typeof NotificationsModule;

const KEY = 'wakeAlarm';
/** The channel with the khol alarm sound (res/raw/khol_wake.wav through app.json's expo-notifications "sounds"). */
export const WAKE_CHANNEL_ID = 'wake-alarm-khol';
const WAKE_SOUND = 'khol_wake.wav';
/** The notification category with Stop and Snooze (no '-' or ':' in category ids, expo-notifications). */
export const WAKE_CATEGORY = 'wakeAlarm';
const KIND = 'wakeAlarm';
/** One snoozed ring at a time: a second Snooze replaces it. */
const SNOOZE_ID = 'wake-alarm-snooze';
export const STOP_ACTION = 'stop';
export const SNOOZE_ACTION = 'snooze';

/** True where the alarm can work: the Android app. */
export const wakeAlarmPossible = Platform.OS === 'android';

/** True on Android 12 and later, where exact time needs the "Alarms & reminders" right. */
export const exactAlarmSetting = Platform.OS === 'android' && Number(Platform.Version) >= 31;

/** The alarm this login set on this phone, or null (off). */
export function readWakeAlarm(profileId: string): WakeAlarm | null {
  return parseSavedAlarm(readLocal(KEY), profileId);
}

/** The data each alarm notification carries: what the background task needs, with no storage read. */
type WakeData = { kind: typeof KIND; url: string; snooze: number };

/**
 * Removes this app's alarms, and a pending snooze unless `keepSnooze` (the alarm scheduled again on a visit), from the
 * phone's schedule. Turned off for good, also the background task: while it is registered, every push arriving with the
 * app closed starts the app's code for a moment, so only a phone with an alarm has it.
 */
async function cancelScheduled(module: Notifications, keepSnooze = false): Promise<void> {
  if (!keepSnooze) await module.unregisterTaskAsync(WAKE_ALARM_TASK).catch(() => undefined);
  try {
    const scheduled = await module.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => (n.identifier === SNOOZE_ID ? !keepSnooze : n.content.data?.kind === KIND))
        .map((n) => module.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Nothing scheduled, or the schedule cannot be read: nothing to remove.
  }
}

/** The channel and the Stop / Snooze buttons, in the app's language now. */
async function setUpChannel(module: Notifications, snooze: number): Promise<void> {
  await module.setNotificationChannelAsync(WAKE_CHANNEL_ID, {
    name: i18n.t('wakeAlarm.channel'),
    description: i18n.t('wakeAlarm.channelDescription'),
    importance: module.AndroidImportance.MAX,
    sound: WAKE_SOUND,
    audioAttributes: { usage: module.AndroidAudioUsage.ALARM, contentType: module.AndroidAudioContentType.SONIFICATION },
    bypassDnd: true,
    lockscreenVisibility: module.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 600, 400, 600],
    enableVibrate: true,
  });
  await module.setNotificationCategoryAsync(WAKE_CATEGORY, [
    { identifier: STOP_ACTION, buttonTitle: i18n.t('wakeAlarm.stop'), options: { opensAppToForeground: false } },
    { identifier: SNOOZE_ACTION, buttonTitle: i18n.t('wakeAlarm.snoozeButton', { m: snooze }), options: { opensAppToForeground: false } },
  ]);
}

/** The words and data of a ring. */
function ringContent(module: Notifications, data: WakeData, snoozed: boolean): NotificationsModule.NotificationContentInput {
  return {
    title: i18n.t(snoozed ? 'wakeAlarm.snoozedTitle' : 'wakeAlarm.ringTitle'),
    body: i18n.t('wakeAlarm.ringBody', { m: data.snooze }),
    categoryIdentifier: WAKE_CATEGORY,
    priority: module.AndroidNotificationPriority.MAX,
    data,
  };
}

/** Schedules `alarm` once a week on each of its days. 'denied' = notifications are off for the app. */
async function schedule(alarm: WakeAlarm, url: string): Promise<'on' | 'denied' | 'failed'> {
  const module = await notifications();
  if (!module) return 'failed';
  try {
    await setUpChannel(module, alarm.snooze);
    const current = await module.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) status = (await module.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    await cancelScheduled(module, true);
    // Without the task the buttons still work while the app's code runs; the alarm itself rings either way.
    await module.registerTaskAsync(WAKE_ALARM_TASK).catch(() => undefined);
    const [hour, minute] = alarm.time.split(':').map(Number);
    const data: WakeData = { kind: KIND, url, snooze: alarm.snooze };
    for (const day of alarm.days) {
      await module.scheduleNotificationAsync({
        identifier: `wake-alarm-${day}`,
        content: ringContent(module, data, false),
        trigger: {
          type: module.SchedulableTriggerInputTypes.WEEKLY,
          weekday: triggerWeekday(day),
          hour,
          minute,
          channelId: WAKE_CHANNEL_ID,
        },
      });
    }
    return 'on';
  } catch {
    return 'failed';
  }
}

/**
 * Turns the alarm on (or changes it), or off with null. `url` is the Practice tools of the person's area, opened by a
 * tap on the alarm. Asks for the notification permission when needed. 'denied' and 'failed' keep what was set.
 */
export async function setWakeAlarm(
  profileId: string,
  alarm: WakeAlarm | null,
  url: string,
): Promise<'on' | 'off' | 'denied' | 'failed'> {
  if (alarm === null) {
    removeLocal(KEY);
    const module = await notifications();
    if (module) await cancelScheduled(module);
    return 'off';
  }
  const result = await schedule(alarm, url);
  if (result === 'on') writeLocal(KEY, JSON.stringify({ profileId, ...alarm, url }));
  return result;
}

/** Schedules this login's alarm again (Practice tools in view): new wording, and a repair if it was dropped. */
export async function refreshWakeAlarm(profileId: string): Promise<void> {
  const alarm = readWakeAlarm(profileId);
  if (!alarm || !wakeAlarmPossible) return;
  let url = '/student/practice';
  try {
    const saved = JSON.parse(readLocal(KEY) ?? '{}') as { url?: unknown };
    if (typeof saved.url === 'string') url = saved.url;
  } catch {
    // The default screen.
  }
  await schedule(alarm, url);
}

/** At sign-out: no alarm stays set for the next person on this phone. */
export async function forgetWakeAlarm(): Promise<void> {
  removeLocal(KEY);
  const module = await notifications();
  if (module) await cancelScheduled(module);
}

/**
 * Opens Android's "Alarms & reminders" for this app (Android 12 and later), or the app's own settings page, which
 * lists it, where the phone has no direct way.
 */
export async function openExactAlarmSetting(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

/** A notification response as the listener gets it, or as the background task gets it (data as a JSON string). */
export type WakeResponse = {
  actionIdentifier?: string;
  notification?: { date?: number; request?: { identifier?: string; content?: { data?: unknown; dataString?: string } } };
};

/** The alarm data of a response, or null when it is not a wake-up alarm's. */
function wakeDataOf(response: WakeResponse): WakeData | null {
  const content = response.notification?.request?.content;
  let data: unknown = content?.data;
  if ((!data || typeof data !== 'object') && typeof content?.dataString === 'string') {
    try {
      data = JSON.parse(content.dataString);
    } catch {
      data = null;
    }
  }
  const d = data as Partial<WakeData> | null;
  return d && d.kind === KIND && typeof d.snooze === 'number' && typeof d.url === 'string' ? (d as WakeData) : null;
}

/** Responses handled in this run of the app's code, so the listener and the task never handle one twice. */
const handled = new Set<string>();

/**
 * Stop, Snooze or a tap on a wake-up alarm: silences it (removes it from the list), and for Snooze rings again after
 * its minutes; Stop and a tap drop a pending snooze. True when it was an alarm's. Never throws.
 */
export async function handleWakeResponse(response: WakeResponse): Promise<boolean> {
  const data = wakeDataOf(response);
  const id = response.notification?.request?.identifier;
  if (!data || !id) return false;
  const action = response.actionIdentifier ?? '';
  // One ring (its moment) and one button: a weekly alarm keeps its id, so the moment tells this week's from the last.
  const key = `${id}|${action}|${response.notification?.date ?? ''}`;
  if (handled.has(key)) return true;
  handled.add(key);
  const module = await notifications();
  if (!module) return true;
  try {
    await module.dismissNotificationAsync(id);
  } catch {
    // Already gone (a tap removes it by itself).
  }
  try {
    if (action === SNOOZE_ACTION) {
      await module.scheduleNotificationAsync({
        identifier: SNOOZE_ID,
        content: ringContent(module, data, true),
        trigger: {
          type: module.SchedulableTriggerInputTypes.DATE,
          date: snoozeUntil(new Date(), data.snooze),
          channelId: WAKE_CHANNEL_ID,
        },
      });
    } else if (id !== SNOOZE_ID) {
      await module.cancelScheduledNotificationAsync(SNOOZE_ID);
    }
  } catch {
    // Snooze could not be set: the next ring is the next chosen day.
  }
  return true;
}

// While the app's code runs (open, or in the background), the buttons come here; with the app closed, to the task.
void notifications().then((module) => {
  module?.addNotificationResponseReceivedListener((response) => void handleWakeResponse(response));
});
