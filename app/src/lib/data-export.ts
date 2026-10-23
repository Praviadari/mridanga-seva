// Getting "a summary of my data" (#550) out of the Android app with what the installed APK already has (no new
// native package, docs/DECISIONS.md #50): the JSON file is written to the cache and handed to the share sheet
// through expo-sharing (Drive, Gmail, Files ...), as the calendar file is (./calendar-file.ts). Printing is the web
// app's (./data-export.web.ts): the phone shows the summary on the screen instead.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** What happened. */
export type ExportResult = 'saved' | 'cancelled' | 'failed';

/** Whether this platform prints the summary page. */
export const CAN_PRINT = false;

/** Writes the JSON file to the cache and opens the share sheet with it. */
export async function saveJsonFile(fileName: string, text: string, dialogTitle: string): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Not on the phone (CAN_PRINT is false). */
export function printPage(_html: string, _css: string): void {}
