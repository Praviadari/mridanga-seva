// Which module a route belongs to, by its first segment after the role, and that module's colour (launch UI,
// docs/DECISIONS.md #354). Pure, so tests run it; the hook that reads the current route is theme/module-tone.ts.
// Since UI audit fix 9 (#368) a colour is a family, not a module: blue = the class at a glance and at the door
// (Overview, To do, Check-in, attendance, follow-up calls, reports), green = people (Welcome desk, Newcomers, students,
// In class now, groups, About you), purple = learning (lessons and levels, assessments, level-ups, progress, taals),
// teal = seva (instruments, seva roster, class fund, suggestions, practice), orange = community (News, Events & polls,
// Ishtagoshti). Pink and indigo are no longer module colours.

import type { ModuleTone } from '@/theme/colors';

/** The five families (#368). */
export const TONE_FAMILIES = ['blue', 'green', 'purple', 'teal', 'orange'] as const satisfies readonly ModuleTone[];

/** First route segment after the role (staff / student), groups like "(tabs)" left out → the module's colour. */
const STAFF: Record<string, (typeof TONE_FAMILIES)[number]> = {
  overview: 'blue',
  waiting: 'blue',
  attendance: 'blue',
  'mark-attendance': 'blue',
  visits: 'blue',
  'qr-cards': 'blue',
  'follow-up': 'blue',
  calls: 'blue',
  call: 'blue',
  'follow-ups-by-coordinator': 'blue',
  reports: 'blue',
  'heard-about': 'blue',
  students: 'green',
  'class-list': 'green',
  register: 'green',
  'new-joiners': 'green',
  'here-now': 'green',
  groups: 'green',
  syllabus: 'purple',
  levels: 'purple',
  lesson: 'purple',
  materials: 'purple',
  assessments: 'purple',
  promotion: 'purple',
  taals: 'purple',
  inventory: 'teal',
  duty: 'teal',
  fund: 'teal',
  suggestions: 'teal',
  practice: 'teal',
  announcements: 'orange',
  events: 'orange',
  polls: 'orange',
  ishtagoshti: 'orange',
};

const STUDENT: Record<string, (typeof TONE_FAMILIES)[number]> = {
  'my-qr': 'blue',
  qr: 'blue',
  visits: 'blue',
  'about-you': 'green',
  progress: 'purple',
  lesson: 'purple',
  assessments: 'purple',
  practice: 'teal',
  'practice-log': 'teal',
  announcements: 'orange',
  events: 'orange',
  polls: 'orange',
  ishtagoshti: 'orange',
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
