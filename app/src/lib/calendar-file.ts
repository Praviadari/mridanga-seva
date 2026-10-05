// "Add to calendar" for an event (S11), with what the APK has (docs/DECISIONS.md #55, #61): no
// calendar permission and no expo-calendar. Two ways:
// - an .ics file (iCalendar, RFC 5545): on the phone it is written to the cache and handed to the
//   share sheet through expo-sharing (calendar apps that take .ics files appear there); in the
//   browser (./calendar-file.web.ts) it downloads, and iPhone Safari offers "Add to Calendar";
// - a Google Calendar link that opens the event ready to save, in the Calendar app or the browser.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { icsFileName, icsOf, type CalendarEvent, type CalendarResult } from './calendar-text';

export { googleCalendarLink, type CalendarEvent, type CalendarResult } from './calendar-text';

/** Writes the .ics file to the cache and opens the share sheet with it. */
export async function shareCalendarFile(event: CalendarEvent, dialogTitle: string): Promise<CalendarResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    const file = new File(Paths.cache, icsFileName(event));
    if (file.exists) file.delete();
    file.create();
    file.write(icsOf(event));
    await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle });
    return 'shared';
  } catch {
    return 'failed';
  }
}
