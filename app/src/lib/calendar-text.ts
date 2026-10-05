// The text of "Add to calendar" (S11), the same on the phone and in the browser: an iCalendar
// (.ics, RFC 5545) file and a Google Calendar link. Sharing the file: ./calendar-file.ts / .web.ts.

/** What the calendar needs about an event. Times are ISO timestamps. */
export type CalendarEvent = {
  id: number;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  /** No end: one hour is assumed (calendars need one). */
  endsAt: string | null;
};

/** What happened. */
export type CalendarResult = 'shared' | 'cancelled' | 'failed';

/** A moment as iCalendar / Google UTC time: 20261004T130000Z. */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function endOf(event: CalendarEvent): string {
  return event.endsAt ?? new Date(Date.parse(event.startsAt) + 3600_000).toISOString();
}

/** Escapes text for an iCalendar value (backslash, semicolon, comma, new lines). */
function icsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, as RFC 5545 asks (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    if (bytes.encode(current + char).length > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/** The .ics text of one event. */
export function icsOf(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mridanga Seva//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:mridanga-seva-event-${event.id}@mridanga-seva.app`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    `DTEND:${utcStamp(endOf(event))}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A Google Calendar link that opens the event ready to save. */
export function googleCalendarLink(event: CalendarEvent): string {
  const params = [
    ['action', 'TEMPLATE'],
    ['text', event.title],
    ['dates', `${utcStamp(event.startsAt)}/${utcStamp(endOf(event))}`],
    ['details', event.description],
    ['location', event.location],
    ['ctz', 'Asia/Kolkata'],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** The .ics file's name: the title in plain letters, e.g. Janmashtami-kirtan.ics. */
export function icsFileName(event: CalendarEvent): string {
  const base = event.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${base || `event-${event.id}`}.ics`;
}
