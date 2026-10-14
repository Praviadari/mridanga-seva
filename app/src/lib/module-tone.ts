// Which module a route belongs to, by its first segment after the role, and that module's colour (launch UI,
// docs/DECISIONS.md #354). Pure, so tests run it; the hook that reads the current route is theme/module-tone.ts.

import type { ModuleTone } from '@/theme/colors';

/** First route segment after the role (staff / student), groups like "(tabs)" left out → the module's colour. */
const STAFF: Record<string, ModuleTone> = {
  attendance: 'blue',
  'mark-attendance': 'blue',
  'here-now': 'teal',
  visits: 'teal',
  'qr-cards': 'blue',
  students: 'green',
  'class-list': 'green',
  register: 'green',
  'new-joiners': 'orange',
  syllabus: 'purple',
  groups: 'pink',
  'follow-up': 'purple',
  calls: 'purple',
  call: 'purple',
  'follow-ups-by-coordinator': 'purple',
  announcements: 'orange',
  levels: 'purple',
  lesson: 'purple',
  materials: 'purple',
  suggestions: 'green',
  assessments: 'indigo',
  promotion: 'green',
  events: 'pink',
  polls: 'pink',
  ishtagoshti: 'orange',
  practice: 'purple',
  taals: 'purple',
  inventory: 'teal',
  duty: 'blue',
  fund: 'orange',
  overview: 'blue',
  waiting: 'orange',
};

const STUDENT: Record<string, ModuleTone> = {
  'my-qr': 'blue',
  qr: 'blue',
  announcements: 'orange',
  progress: 'purple',
  lesson: 'purple',
  assessments: 'indigo',
  practice: 'pink',
  'practice-log': 'pink',
  visits: 'teal',
  events: 'purple',
  polls: 'purple',
  ishtagoshti: 'orange',
  'about-you': 'green',
};

/** The module colour for route segments (exported for tests). */
export function moduleToneFor(segments: readonly string[]): ModuleTone | undefined {
  const [role, ...rest] = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  const first = rest[0];
  if (!first) return undefined;
  if (role === 'staff') return STAFF[first];
  if (role === 'student') return STUDENT[first];
  return undefined;
}
