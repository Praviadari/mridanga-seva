// Removes what a signed-in person leaves on this device besides the login itself, at every
// sign-out: their own Sign out, and a login the server ended (src/auth/auth-provider.tsx, the
// SIGNED_OUT event). On a shared family phone or computer the next person then finds no trace of
// them (docs/DECISIONS.md #186):
// - the student's saved QR card (src/data/my-student.ts; D3-05);
// - this app's notifications in the phone's list (src/lib/push.ts; FLOW-04);
// - photos kept by the image cache, often of children (expo-image's memory and disk cache; D3-09);
// - copies made while picking files for an upload: shrunk photos and picked PDFs, which the
//   pickers leave in the app's cache folder (D3-09, D4-16).

import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { Platform } from 'react-native';

import { clearSavedCard } from '@/data/my-student';

import { dismissNotifications } from './push';

/** The cache folders expo-image-manipulator, expo-document-picker and expo-image-picker write to. */
const PICKED_FILE_FOLDERS = ['ImageManipulator', 'DocumentPicker', 'ImagePicker'];

/** Clears the traces listed at the top of this file. Never throws; each part is best effort. */
export async function clearDeviceTraces(): Promise<void> {
  clearSavedCard();
  await Promise.all([
    dismissNotifications(),
    Image.clearMemoryCache().catch(() => false),
    Image.clearDiskCache().catch(() => false),
  ]);
  if (Platform.OS === 'web') return;
  for (const name of PICKED_FILE_FOLDERS) {
    try {
      const folder = new Directory(Paths.cache, name);
      if (folder.exists) folder.delete();
    } catch {
      // A file still open, or the folder already gone: the next sign-out tries again.
    }
  }
}
