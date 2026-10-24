// Removes what a signed-in person leaves on this device besides the login itself, at every
// sign-out: their own Sign out, and a login the server ended (src/auth/auth-provider.tsx, the
// SIGNED_OUT event). On a shared family phone or computer the next person then finds no trace of
// them (docs/DECISIONS.md #186):
// - the student's saved QR card (src/data/my-student.ts; D3-05);
// - this app's notifications in the phone's list (src/lib/push.ts; FLOW-04);
// - photos kept by the image cache, often of children (expo-image's memory and disk cache; D3-09);
// - copies made while picking files for an upload: shrunk photos and picked PDFs, which the
//   pickers leave in the app's cache folder (D3-09, D4-16);
// - audio recordings (audit S5-02, docs/DECISIONS.md #283): the student's "Record myself" takes
//   (lib/my-recordings.ts: the app's own recordings/ folder, or the open tab's memory in the browser,
//   listed to whoever signs in next) and every
//   recording expo-audio wrote to the cache (assessment answers, voice notes: Audio/ on Android,
//   ExpoAudio/ on iOS);
// - the daily practice reminder and its scheduled notifications (lib/practice-reminder.ts, #402);
// - "may practise while waiting" and the Beginner lessons list of a waiting login (data/waiting.ts, #510);
// - on the web, everything the service worker keeps for offline use (lib/offline-shell.web.ts, #513).
// - the student's own bests in the tap pad, Echo me and Which bol? (lib/play-bests.ts, #470-#472).
// - check-ins and practice entries still waiting for the signal, and the note about refused ones
//   (lib/offline-queue.ts, #593): they belong to the login that made them.
// - on the web, the note of whose this browser's push subscription is (lib/web-push.web.ts, #604); the
//   subscription itself ends with the service worker.

import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { Platform } from 'react-native';

import { clearSavedCard } from '@/data/my-student';
import { forgetWaitingPractice } from '@/data/waiting-store';
import { forgetMyRecordings } from '@/lib/my-recordings';
import { forgetOfflineQueue } from '@/lib/offline-queue';
import { forgetOfflineShell } from '@/lib/offline-shell';
import { forgetPlayBests } from '@/lib/play-bests';
import { forgetPracticeReminders } from '@/lib/practice-reminder';
import { dismissNotifications } from '@/lib/push';
import { forgetWebPushNote } from '@/lib/web-push';

/**
 * The cache folders deleted at sign-out: what expo-image-manipulator, expo-document-picker,
 * expo-image-picker and expo-audio's recorder write.
 */
export const TRACE_FOLDERS = ['ImageManipulator', 'DocumentPicker', 'ImagePicker', 'Audio', 'ExpoAudio'];

/** Clears the traces listed at the top of this file. Never throws; each part is best effort. */
export async function clearDeviceTraces(): Promise<void> {
  clearSavedCard();
  forgetWaitingPractice();
  forgetPlayBests();
  forgetOfflineQueue();
  forgetWebPushNote();
  await forgetMyRecordings();
  await Promise.all([
    dismissNotifications(),
    forgetPracticeReminders(),
    forgetOfflineShell(),
    Image.clearMemoryCache().catch(() => false),
    Image.clearDiskCache().catch(() => false),
  ]);
  if (Platform.OS === 'web') return;
  for (const name of TRACE_FOLDERS) {
    try {
      const folder = new Directory(Paths.cache, name);
      if (folder.exists) folder.delete();
    } catch {
      // A file still open, or the folder already gone: the next sign-out tries again.
    }
  }
}
