// Where every staff screen is offered, for the coordinator home (C1) and the Guru home (G1). Since the launch
// UI (14-10-2026, Praveen: "too many icons on the Guru dashboard"; docs/DECISIONS.md #350, #351) there are
// three places, each holding a screen once:
// - the bottom tabs (staff/(tabs)/_layout.tsx): Home, Mark attendance (C5), Students (C7), Follow-up calls
//   (C10) and Announcements (C15), used every class or every week by everyone;
// - the ring on the home (StaffModules below): eight circles around the drum, like the student home, with what
//   this role opens in a usual class week; a count on a circle says something waits;
// - the side menu (components/side-menu.tsx, from the menu button in the header): everything else, in groups
//   (StaffMenuGroups below), set-up screens last.
// One file, so the three never offer a screen twice or forget one (tests/launch-ui.test.mjs checks every
// staff screen of the old home and of Running the class is still in one of them).
//
// Coordinator ring: Register a student (the desk), New joiners, Instruments (drums lent at class), Duty roster,
// Events & polls, Assessments, Syllabus and lessons, Ishtagoshti.
// Guru ring: Overview, Follow-ups by coordinator (overdue and escalated), Promotions (to decide), New joiners,
// Assessments, Syllabus and lessons, Events & polls, Ishtagoshti.
// Who is here now and today's visits are the Today line above the ring (components/staff-today.tsx).

import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { IconName } from './icon';
import { ModuleRing, type Module } from './module-ring';

/** Props for StaffModules. */
export type StaffModulesProps = {
  guru: boolean;
  /** Calls due for my students (coordinator), or follow-ups overdue or escalated (Guru). */
  callsDue: number;
  /** Feedback asked of me (coordinator), or nominations to decide (Guru). */
  promotionsWaiting: number;
};

/** The ring of a staff home. */
export function StaffModules({ guru, callsDue, promotionsWaiting }: StaffModulesProps) {
  const { t } = useTranslation();
  const shared = {
    newJoiners: { key: 'newJoiners', icon: 'newJoiner', tone: 'orange', label: t('home.modules.newJoiners'), onPress: () => router.push('/staff/new-joiners') },
    // Phase 2 (docs/DECISIONS.md #52).
    assessments: { key: 'assessments', icon: 'assessment', tone: 'indigo', label: t('assessments.title'), onPress: () => router.push('/staff/assessments') },
    syllabus: { key: 'syllabus', icon: 'library', tone: 'purple', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    // Phase 2 slice 5: events and polls (C16, C17; docs/DECISIONS.md #61).
    events: { key: 'events', icon: 'events', tone: 'pink', label: t('events.module'), onPress: () => router.push('/staff/events') },
    // On a phone the Ishtagoshti tab does not fit the bottom bar; this opens the tab itself.
    ishtagoshti: { key: 'ishtagoshti', icon: 'ishtagoshti', tone: 'orange', label: t('ishtagoshti.title'), onPress: () => router.push('/staff/ishtagoshti') },
  } satisfies Record<string, Module>;
  const ring: Module[] = guru
    ? [
        { key: 'overview', icon: 'status', tone: 'blue', label: t('home.modules.overview'), onPress: () => router.push('/staff/overview') },
        {
          key: 'calls',
          icon: 'calls',
          tone: 'purple',
          label: t('staff.followUp'),
          badge: callsDue,
          badgeSpoken: t('home.badges.due', { count: callsDue }),
          onPress: () => router.push('/staff/follow-ups-by-coordinator'),
        },
        {
          key: 'promotions',
          icon: 'promote',
          tone: 'green',
          label: t('home.modules.promotions'),
          badge: promotionsWaiting,
          badgeSpoken: t('home.badges.waiting', { count: promotionsWaiting }),
          onPress: () => router.push('/staff/promotion'),
        },
        shared.newJoiners,
        shared.assessments,
        shared.syllabus,
        shared.events,
        shared.ishtagoshti,
      ]
    : [
        { key: 'register', icon: 'register', tone: 'green', label: t('staff.registerStudent'), onPress: () => router.push('/staff/register') },
        shared.newJoiners,
        // Phase 2 slice 8 (docs/DECISIONS.md #65): C19 inventory, C20 duty roster.
        { key: 'instruments', icon: 'drum', tone: 'teal', label: t('modules.instruments'), onPress: () => router.push('/staff/inventory') },
        { key: 'duty', icon: 'time', tone: 'blue', label: t('duty.title'), onPress: () => router.push('/staff/duty') },
        shared.events,
        shared.assessments,
        shared.syllabus,
        shared.ishtagoshti,
      ];
  return <ModuleRing modules={ring} />;
}

/** One line of the side menu. */
export type MenuItem = {
  key: string;
  icon: IconName;
  /** Already translated. */
  label: string;
  href: Href;
};

/** A group of the side menu, with its heading. */
export type MenuGroup = { key: string; title: string; items: MenuItem[] };

/**
 * The side menu's groups for this role: every staff screen that is neither a bottom tab nor a circle on this
 * role's home. The menu opens them with router.push (only stack screens here, never a tab: R4-01).
 */
export function staffMenuGroups(guru: boolean, t: TFunction): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      key: 'class',
      title: t('menu.groups.class'),
      items: guru
        ? [
            { key: 'register', icon: 'register', label: t('staff.registerStudent'), href: '/staff/register' },
            { key: 'groups', icon: 'groups', label: t('groups.title'), href: '/staff/groups' },
            { key: 'duty', icon: 'time', label: t('duty.title'), href: '/staff/duty' },
            { key: 'instruments', icon: 'drum', label: t('modules.instruments'), href: '/staff/inventory' },
          ]
        : [
            { key: 'overview', icon: 'status', label: t('home.modules.overview'), href: '/staff/overview' },
            { key: 'groups', icon: 'groups', label: t('groups.title'), href: '/staff/groups' },
          ],
    },
    {
      key: 'teaching',
      title: t('menu.groups.teaching'),
      items: [
        ...(guru ? [] : [{ key: 'promotions', icon: 'promote', label: t('home.modules.promotions'), href: '/staff/promotion' } satisfies MenuItem]),
        // Phase 2 slice 3 (S5, docs/DECISIONS.md #54).
        { key: 'practice', icon: 'practice', label: t('practice.module'), href: '/staff/practice' },
        // C18 material suggestions (docs/DECISIONS.md #65).
        { key: 'suggestions', icon: 'feedback', label: t('suggestions.title'), href: '/staff/suggestions' },
      ],
    },
    {
      key: 'seva',
      title: t('menu.groups.seva'),
      // Phase 2 slice 9 (docs/DECISIONS.md #80): the class fund ledger, read by all staff.
      items: [{ key: 'fund', icon: 'fund', label: t('fund.title'), href: '/staff/fund' }],
    },
    {
      key: 'reports',
      title: t('menu.groups.reports'),
      items: guru
        ? [
            { key: 'reports', icon: 'report', label: t('reports.titleGuru'), href: '/staff/reports' },
            { key: 'heard', icon: 'newJoiner', label: t('heardReport.title'), href: '/staff/heard-about' },
            { key: 'audit', icon: 'audit', label: t('auditLog.title'), href: '/staff/audit-log' },
          ]
        : [{ key: 'reports', icon: 'report', label: t('reports.titleCoordinator'), href: '/staff/reports' }],
    },
  ];
  if (guru) {
    // Running the class (staff/running-the-class.tsx, G2 G3 G9 G10 G12): set-up, rarely used once the class runs.
    groups.push({
      key: 'setup',
      title: t('menu.groups.setup'),
      items: [
        { key: 'coordinators', icon: 'groups', label: t('coordinators.title'), href: '/staff/coordinators' },
        { key: 'database', icon: 'students', label: t('database.title'), href: '/staff/database' },
        { key: 'centres', icon: 'location', label: t('centres.title'), href: '/staff/centres' },
        { key: 'settings', icon: 'settings', label: t('settings.title'), href: '/staff/settings' },
        { key: 'options', icon: 'lists', label: t('options.title'), href: '/staff/options' },
      ],
    });
  }
  groups.push({
    key: 'me',
    title: t('menu.groups.me'),
    items: [
      { key: 'profile', icon: 'profile', label: t('myProfile.title'), href: '/staff/profile' },
      { key: 'notifications', icon: 'bell', label: t('inbox.title'), href: '/staff/notifications' },
    ],
  });
  return groups;
}

/** Opens a side-menu line's screen on top of the tabs. */
export function openMenuItem(item: MenuItem) {
  router.push(item.href);
}
