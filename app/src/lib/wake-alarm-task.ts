// The wake-up alarm's Stop and Snooze with the app closed (docs/DECISIONS.md #792). Android runs this task when a
// notification button is pressed while the app is not in front: expo-notifications hands the response to
// expo-task-manager, which starts the app's code without a screen. The task must be defined before anything else
// runs, so src/entry.ts imports this file first. Kept small: the work itself is lib/wake-alarm.ts, loaded only when
// the task runs. registerWakeAlarmTask is called when the alarm is set (lib/wake-alarm.ts schedule) and on each
// Practice tools visit; Android keeps the registration across restarts.

import * as TaskManager from 'expo-task-manager';

export const WAKE_ALARM_TASK = 'wake-alarm-buttons';

TaskManager.defineTask<Record<string, unknown>>(WAKE_ALARM_TASK, async ({ data, error }) => {
  // A response has actionIdentifier; anything else (a push arriving in the background) is not this task's.
  if (error || !data || typeof data !== 'object' || !('actionIdentifier' in data)) return;
  try {
    const { handleWakeResponse } = await import('./wake-alarm');
    await handleWakeResponse(data);
  } catch {
    // The alarm still stops at the end of its sound, and the next ring is the next chosen day.
  }
});
