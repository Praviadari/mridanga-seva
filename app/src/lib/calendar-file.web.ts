// The browser version of ./calendar-file.ts: the .ics file downloads like any file from a website
// (a laptop's calendar opens it; iPhone Safari offers "Add to Calendar"). The text and the Google
// Calendar link are the same as on the phone (./calendar-text.ts).

import { icsFileName, icsOf, type CalendarEvent, type CalendarResult } from './calendar-text';

export { googleCalendarLink, type CalendarEvent, type CalendarResult } from './calendar-text';

/** Downloads the .ics file. */
export async function shareCalendarFile(event: CalendarEvent, _dialogTitle: string): Promise<CalendarResult> {
  try {
    const url = URL.createObjectURL(new Blob([icsOf(event)], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = icsFileName(event);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'shared';
  } catch {
    return 'failed';
  }
}
