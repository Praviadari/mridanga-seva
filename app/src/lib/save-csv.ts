// Getting a CSV file out of the Android app with what the installed APK already has (no new native
// package, docs/DECISIONS.md #50): "Save to a folder" asks Android for a folder (Downloads, Drive …)
// through expo-file-system's folder picker and writes the file there; "Share" hands the text to
// WhatsApp, Gmail and the like through React Native's own share sheet. The web version is
// ./save-csv.web.ts (a normal download).

import { Directory } from 'expo-file-system';
import { Platform, Share } from 'react-native';

/** The ways this platform offers: on Android a folder and the share sheet. */
export const CSV_WAYS: readonly ('download' | 'folder' | 'share')[] = Platform.OS === 'android' ? ['folder', 'share'] : ['share'];

/** What happened. */
export type CsvResult = 'saved' | 'cancelled' | 'failed';

/** Asks for a folder and writes `text` there as `fileName`. */
export async function saveCsvToFolder(fileName: string, text: string): Promise<CsvResult> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // The picker throws when the person closes it without choosing.
    return 'cancelled';
  }
  try {
    const file = folder.createFile(fileName, 'text/csv');
    file.write(text);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Opens the share sheet with the CSV text (the receiving app decides how it keeps it). */
export async function shareCsv(fileName: string, text: string): Promise<CsvResult> {
  try {
    const result = await Share.share({ title: fileName, message: text.replace(/^\uFEFF/, '') });
    return result.action === Share.dismissedAction ? 'cancelled' : 'saved';
  } catch {
    return 'failed';
  }
}

/** The browser's way; on the phone it opens the share sheet. */
export async function downloadCsv(fileName: string, text: string): Promise<CsvResult> {
  return shareCsv(fileName, text);
}
