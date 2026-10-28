// The facilitator's module tree (Sarvesh Prji's Facilitator SOP 360° review, 27-10-2026, locked; docs/DECISIONS.md
// #700-#709): eleven modules on the facilitator's Home in this order, each opening its own landing screen
// (app/staff/modules/[key].tsx) with short sections, and each row of a section opening a screen that already
// existed, at its old address. Only the way in moved; no screen moved or was copied (#701). Every screen the
// facilitator's old ring, side menu and tabs offered is in exactly one module (docs/SCREENS.md "Facilitator
// modules", tests/facilitator-home.test.mjs).
//
// `roles` hides a module or a row from a login that cannot use it (a coordinator who types the address). Hiding is
// never the guard: each screen checks the role again and row-level security refuses the data (#704).
// Colours are the five families of #368 (lib/module-tone.ts); Admin, Security & Audits and Settings are set-up, saffron.
// A module with `soon` has nothing built yet: dimmed on Home, "Coming soon", not a button (lead decision 28-10-2026).
// Labels are i18n keys (checked by tsc), so this file stays plain data that the tests read.

import type { Href } from 'expo-router';
import type { ParseKeys } from 'i18next';

import type { IconName } from '@/components/icon';
import type { ModuleTone } from '@/theme/colors';

/** The staff roles (profiles.role); 'guru' is the facilitator's internal name (#40, #706). */
export type StaffRole = 'guru' | 'coordinator';

/** The approved order of the Home modules (spec addendum A); never re-sort. */
export const FACILITATOR_MODULE_KEYS = [
  'admin',
  'coordinators',
  'students',
  'teaching',
  'inventory',
  'media',
  'events',
  'funds',
  'reports',
  'security',
  'settings',
] as const;

export type FacilitatorModuleKey = (typeof FACILITATOR_MODULE_KEYS)[number];

/** One line of a module's landing screen: an existing screen. */
export type ModuleRow = {
  key: string;
  icon: IconName;
  /** i18n key of the row's name (mostly the screen's own title). */
  label: ParseKeys;
  href: Href;
  /**
   * The screen is a bottom tab: opened with router.navigate, which goes back to the tabs and selects it, never a
   * second copy of the tabs on top (audit R4-01). Tabs that have a copy for screens on top use that copy instead.
   */
  tab?: boolean;
  /** Left out: both staff roles. */
  roles?: readonly StaffRole[];
  /** Shown only when the login has its own student record (0053, #316). */
  ownRecord?: boolean;
};

/** A section of a landing screen (the spec's submodule). */
export type ModuleSection = { key: string; title: ParseKeys; rows: readonly ModuleRow[] };

export type FacilitatorModule = {
  key: FacilitatorModuleKey;
  icon: IconName;
  tone?: ModuleTone;
  /** i18n key of the module's name, the same on Home, the side menu and the landing screen's title. */
  label: ParseKeys;
  roles: readonly StaffRole[];
  /** Nothing built yet: dimmed, "Coming soon", not tappable. */
  soon?: boolean;
  sections: readonly ModuleSection[];
};

const FACILITATOR: readonly StaffRole[] = ['guru'];
const STAFF: readonly StaffRole[] = ['guru', 'coordinator'];

/** The eleven modules, in the approved order. */
export const FACILITATOR_MODULES: readonly FacilitatorModule[] = [
  {
    key: 'admin',
    icon: 'about',
    label: 'facilitatorHome.modules.admin',
    roles: FACILITATOR,
    sections: [
      { key: 'centres', title: 'facilitatorHome.sections.centres', rows: [{ key: 'centres', icon: 'location', label: 'centres.title', href: '/staff/centres' }] },
      { key: 'operations', title: 'facilitatorHome.sections.operations', rows: [{ key: 'options', icon: 'lists', label: 'options.title', href: '/staff/options' }] },
    ],
  },
  {
    key: 'coordinators',
    icon: 'groups',
    tone: 'green',
    label: 'facilitatorHome.modules.coordinators',
    roles: FACILITATOR,
    sections: [
      { key: 'team', title: 'facilitatorHome.sections.team', rows: [{ key: 'coordinators', icon: 'groups', label: 'coordinators.title', href: '/staff/coordinators' }] },
      {
        key: 'followUps',
        title: 'facilitatorHome.sections.followUps',
        rows: [{ key: 'followUpsByCoordinator', icon: 'calls', label: 'home.guru.followUps', href: '/staff/follow-ups-by-coordinator' }],
      },
    ],
  },
  {
    key: 'students',
    icon: 'students',
    tone: 'green',
    label: 'facilitatorHome.modules.students',
    roles: STAFF,
    sections: [
      {
        key: 'directory',
        title: 'facilitatorHome.sections.directory',
        rows: [
          // The Students tab's page, opened on top (class-list.tsx, R4-01).
          { key: 'classList', icon: 'students', label: 'facilitatorHome.rows.studentList', href: '/staff/class-list' },
          { key: 'database', icon: 'students', label: 'database.title', href: '/staff/database', roles: FACILITATOR },
          { key: 'qrCards', icon: 'qr', label: 'qrCards.title', href: '/staff/qr-cards' },
        ],
      },
      {
        key: 'registration',
        title: 'facilitatorHome.sections.registration',
        rows: [
          { key: 'register', icon: 'register', label: 'staff.registerStudent', href: '/staff/register' },
          { key: 'newJoiners', icon: 'newJoiner', label: 'home.modules.newJoiners', href: '/staff/new-joiners' },
          { key: 'import', icon: 'download', label: 'importStudents.title', href: '/staff/database/import', roles: FACILITATOR },
        ],
      },
      {
        key: 'attendance',
        title: 'facilitatorHome.sections.attendance',
        rows: [
          // The Check-in tab's page, opened on top (mark-attendance.tsx, R4-01).
          { key: 'checkIn', icon: 'attendance', label: 'staff.markAttendance', href: '/staff/mark-attendance' },
          { key: 'hereNow', icon: 'hereNow', label: 'staff.hereNow', href: '/staff/here-now' },
        ],
      },
      {
        key: 'followUps',
        title: 'facilitatorHome.sections.followUps',
        // The Follow-ups tab's page, opened on top (calls.tsx, R4-01).
        rows: [{ key: 'calls', icon: 'calls', label: 'facilitatorHome.rows.calls', href: '/staff/calls' }],
      },
    ],
  },
  {
    key: 'teaching',
    icon: 'library',
    tone: 'purple',
    label: 'facilitatorHome.modules.teaching',
    roles: STAFF,
    sections: [
      {
        key: 'syllabus',
        title: 'facilitatorHome.sections.syllabus',
        rows: [
          { key: 'lessons', icon: 'library', label: 'syllabusEditor.module', href: '/staff/levels' },
          { key: 'suggestions', icon: 'feedback', label: 'suggestions.title', href: '/staff/suggestions' },
        ],
      },
      { key: 'assessments', title: 'facilitatorHome.sections.assessments', rows: [{ key: 'assessments', icon: 'assessment', label: 'assessments.title', href: '/staff/assessments' }] },
      { key: 'levelUps', title: 'facilitatorHome.sections.levelUps', rows: [{ key: 'promotions', icon: 'promote', label: 'home.modules.promotions', href: '/staff/promotion' }] },
      {
        key: 'practice',
        title: 'facilitatorHome.sections.practice',
        rows: [
          { key: 'practice', icon: 'practice', label: 'practice.module', href: '/staff/practice' },
          // Rhythm Playground content, approval, assignments and class progress (docs/DECISIONS.md #740).
          { key: 'playground', icon: 'listen', label: 'staffPlayground.title', href: '/staff/playground' },
        ],
      },
      {
        key: 'ishtagoshti',
        title: 'facilitatorHome.sections.ishtagoshti',
        rows: [{ key: 'ishtagoshti', icon: 'ishtagoshti', label: 'facilitatorHome.rows.ishtagoshti', href: '/staff/ishtagoshti', tab: true }],
      },
    ],
  },
  {
    key: 'inventory',
    icon: 'drum',
    tone: 'teal',
    label: 'facilitatorHome.modules.inventory',
    roles: STAFF,
    sections: [
      {
        key: 'assets',
        title: 'facilitatorHome.sections.assets',
        rows: [
          { key: 'instruments', icon: 'drum', label: 'modules.instruments', href: '/staff/inventory' },
          { key: 'scan', icon: 'qr', label: 'labels.scanTitle', href: '/staff/inventory/scan' },
        ],
      },
      {
        key: 'checks',
        title: 'facilitatorHome.sections.checks',
        rows: [
          { key: 'stocktake', icon: 'stocktake', label: 'stocktake.title', href: '/staff/inventory/stocktake' },
          { key: 'labels', icon: 'print', label: 'labels.title', href: '/staff/inventory/labels' },
        ],
      },
    ],
  },
  // Phase 2 in the spec: no media library is built (announcement and lesson files belong to their own screens).
  { key: 'media', icon: 'photo', tone: 'orange', label: 'facilitatorHome.modules.media', roles: STAFF, soon: true, sections: [] },
  {
    key: 'events',
    icon: 'events',
    tone: 'orange',
    label: 'facilitatorHome.modules.events',
    roles: STAFF,
    sections: [
      { key: 'events', title: 'facilitatorHome.sections.events', rows: [{ key: 'events', icon: 'events', label: 'events.module', href: '/staff/events' }] },
      { key: 'seva', title: 'facilitatorHome.sections.seva', rows: [{ key: 'duty', icon: 'time', label: 'duty.title', href: '/staff/duty' }] },
      {
        key: 'communications',
        title: 'facilitatorHome.sections.communications',
        rows: [
          { key: 'news', icon: 'news', label: 'announcements.title', href: '/staff/announcements', tab: true },
          { key: 'groups', icon: 'groups', label: 'groups.title', href: '/staff/groups' },
        ],
      },
    ],
  },
  {
    key: 'funds',
    icon: 'fund',
    tone: 'teal',
    label: 'facilitatorHome.modules.funds',
    roles: STAFF,
    sections: [
      {
        key: 'ledger',
        title: 'facilitatorHome.sections.ledger',
        rows: [
          { key: 'fund', icon: 'fund', label: 'facilitatorHome.rows.ledger', href: '/staff/fund' },
          { key: 'categories', icon: 'lists', label: 'fund.categoriesTitle', href: '/staff/fund/categories' },
        ],
      },
    ],
  },
  {
    key: 'reports',
    icon: 'report',
    tone: 'blue',
    label: 'facilitatorHome.modules.reports',
    roles: STAFF,
    sections: [
      { key: 'overview', title: 'facilitatorHome.sections.overview', rows: [{ key: 'overview', icon: 'status', label: 'home.modules.overview', href: '/staff/overview' }] },
      {
        key: 'reports',
        title: 'facilitatorHome.sections.reports',
        rows: [
          { key: 'reports', icon: 'report', label: 'reports.titleGuru', href: '/staff/reports' },
          { key: 'heard', icon: 'newJoiner', label: 'heardReport.title', href: '/staff/heard-about', roles: FACILITATOR },
        ],
      },
    ],
  },
  {
    key: 'security',
    icon: 'guardian',
    label: 'facilitatorHome.modules.security',
    roles: FACILITATOR,
    sections: [
      { key: 'security', title: 'facilitatorHome.sections.security', rows: [{ key: 'codes', icon: 'settings', label: 'staffCodes.title', href: '/staff/sign-in-codes' }] },
      { key: 'privacy', title: 'facilitatorHome.sections.privacy', rows: [{ key: 'dataRequests', icon: 'guardian', label: 'dataRequests.title', href: '/staff/data-requests' }] },
      { key: 'audits', title: 'facilitatorHome.sections.audits', rows: [{ key: 'audit', icon: 'audit', label: 'auditLog.title', href: '/staff/audit-log' }] },
      { key: 'technical', title: 'facilitatorHome.sections.technical', rows: [{ key: 'errors', icon: 'alert', label: 'appErrors.title', href: '/staff/app-errors' }] },
    ],
  },
  {
    key: 'settings',
    icon: 'settings',
    label: 'facilitatorHome.modules.settings',
    roles: STAFF,
    sections: [
      {
        key: 'classRules',
        title: 'facilitatorHome.sections.classRules',
        rows: [{ key: 'settings', icon: 'filter', label: 'facilitatorHome.rows.classSettings', href: '/staff/settings', roles: FACILITATOR }],
      },
      {
        key: 'communications',
        title: 'facilitatorHome.sections.communications',
        rows: [{ key: 'parentDigest', icon: 'send', label: 'parentDigest.title', href: '/staff/parent-digest' }],
      },
      {
        key: 'personal',
        title: 'facilitatorHome.sections.personal',
        rows: [
          { key: 'profile', icon: 'profile', label: 'myProfile.title', href: '/staff/profile' },
          { key: 'notifications', icon: 'bell', label: 'inbox.title', href: '/staff/notifications' },
          // Me (0053): the login's own student screens, only with an own record (was the first circle on the ring).
          { key: 'me', icon: 'person', label: 'facilitatorHome.rows.me', href: '/staff/me', ownRecord: true },
        ],
      },
    ],
  },
];

/** A module by its key (an address typed by hand may hold anything). */
export function facilitatorModule(key: string | undefined): FacilitatorModule | undefined {
  return FACILITATOR_MODULES.find((m) => m.key === key);
}

/** May this role open the module (Home shows it, the landing screen lists it)? */
export function moduleAllowed(module: FacilitatorModule, role: string | undefined): boolean {
  return module.roles.some((r) => r === role);
}

/** The sections of a module this login may see: rows filtered by role and own record; empty sections left out. */
export function visibleSections(module: FacilitatorModule, role: string | undefined, ownRecord: boolean): ModuleSection[] {
  return module.sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => (!row.roles || row.roles.some((r) => r === role)) && (!row.ownRecord || ownRecord)),
    }))
    .filter((section) => section.rows.length > 0);
}

/** Every address the tree opens, each once (the tests check it). */
export function moduleHrefs(): string[] {
  return FACILITATOR_MODULES.flatMap((m) => m.sections.flatMap((s) => s.rows.map((r) => String(r.href))));
}

/**
 * Columns of the Home grid: three on a phone (the spec), more on a wide window; fewer only when three cells would be
 * narrower than a label needs (a 320 px screen at large text, or the browser zoomed to 200 %).
 */
export function gridColumns(width: number, fontScale: number): number {
  const minCell = 92 * Math.max(1, fontScale);
  if (width >= 600) return Math.max(3, Math.min(6, Math.floor(width / 140)));
  if (width / 3 >= minCell) return 3;
  return width / 2 >= minCell ? 2 : 1;
}
