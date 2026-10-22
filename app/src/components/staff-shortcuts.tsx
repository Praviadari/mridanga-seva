// Where every staff screen is offered, for the coordinator home (C1) and the Guru home (G1). Since the launch
// UI (14-10-2026, Praveen: "too many icons on the Guru dashboard"; docs/DECISIONS.md #350, #351) there are
// three places, each holding a screen once:
// - the bottom tabs (staff/(tabs)/_layout.tsx): Home, Check-in (C5), Students (C7), Follow-ups (C10) and News
//   (C15), used every class or every week by everyone; no circle repeats a tab (Praveen 14-10-2026);
// - the ring on the home (StaffModules below): eight circles around the drum, like the student home, with what
//   this role opens in a usual class week; a count on a circle says something waits;
// - the side menu (components/side-menu.tsx, from the menu button in the header): everything else, in groups
//   (StaffMenuGroups below), set-up screens last.
// One file, so the three never offer a screen twice or forget one (tests/launch-ui.test.mjs checks every
// staff screen of the old home and of Running the class is still in one of them).
//
// Coordinator ring: Welcome desk, Newcomers, Instruments (drums lent at class), Seva roster, Assessments, Lessons,
// Events & polls, Ishtagoshti.
// Guru ring: Overview, Level-ups (to decide), Assessments, Lessons, Events & polls, Ishtagoshti, Welcome desk,
// Newcomers; Follow-ups by coordinator is in the side menu (the Follow-ups tab and the To do box cover the calls).
// In class now and today's check-ins are the Today line above the ring (components/staff-today.tsx).
// Me (0053, docs/DECISIONS.md #316, #319) comes first on the ring when the Guru has linked the person's login to their
// own student record: My QR, My progress, My attendance and Practice as a student sees them (staff/me). Hidden
// otherwise. The ring then holds nine (module-ring.tsx draws nine smaller).

import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { IconName } from './icon';
import { ModuleRing, type Module } from './module-ring';

/** Props for StaffModules. */
export type StaffModulesProps = {
  guru: boolean;
  /** Feedback asked of me (coordinator), or nominations to decide (Guru). */
  promotionsWaiting: number;
  /** The login has its own student record (0053): show Me. */
  me?: boolean;
};

/** The ring of a staff home. */
export function StaffModules({ guru, promotionsWaiting, me = false }: StaffModulesProps) {
  const { t } = useTranslation();
  const shared = {
    newJoiners: { key: 'newJoiners', icon: 'newJoiner', tone: 'green', label: t('home.modules.newJoiners'), onPress: () => router.push('/staff/new-joiners') },
    // Phase 2 (docs/DECISIONS.md #52).
    assessments: { key: 'assessments', icon: 'assessment', tone: 'purple', label: t('assessments.title'), onPress: () => router.push('/staff/assessments') },
    syllabus: { key: 'syllabus', icon: 'library', tone: 'purple', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    // Phase 2 slice 5: events and polls (C16, C17; docs/DECISIONS.md #61).
    events: { key: 'events', icon: 'events', tone: 'orange', label: t('events.module'), onPress: () => router.push('/staff/events') },
    // On a phone the Ishtagoshti tab does not fit the bottom bar; this opens the tab itself.
    ishtagoshti: { key: 'ishtagoshti', icon: 'ishtagoshti', tone: 'orange', label: t('ishtagoshti.title'), onPress: () => router.push('/staff/ishtagoshti') },
  } satisfies Record<string, Module>;
  // The desk, where sign-ups are accepted and students registered: both roles (the Guru's Follow-ups circle went,
  // Praveen 14-10-2026: the Follow-ups tab is the same; follow-ups by coordinator are in the side menu).
  // Me first, only with an own record (0053): green, people, as About you; on the ring it sits beside the green
  // Welcome desk (coordinator) or Newcomers (the Guru's last circle).
  const own: Module[] = [...(me ? [{ key: 'me', icon: 'person', tone: 'green', label: t('me.title'), onPress: () => router.push('/staff/me') } satisfies Module] : [])];
  const register: Module = { key: 'register', icon: 'register', tone: 'green', label: t('staff.registerStudent'), onPress: () => router.push('/staff/register') };
  // Colour by family (UI audit fix 9, docs/DECISIONS.md #368; lib/module-tone.ts), and the circles of a family side by
  // side, so the ring reads as a few coloured arcs: blue the class at a glance, green people, purple learning, teal
  // seva, orange community.
  const ring: Module[] = guru
    ? [
        { key: 'overview', icon: 'status', tone: 'blue', label: t('home.modules.overview'), onPress: () => router.push('/staff/overview') },
        {
          key: 'promotions',
          icon: 'promote',
          tone: 'purple',
          label: t('home.modules.promotions'),
          badge: promotionsWaiting,
          badgeSpoken: t('home.badges.waiting', { count: promotionsWaiting }),
          onPress: () => router.push('/staff/promotion'),
        },
        shared.assessments,
        shared.syllabus,
        shared.events,
        shared.ishtagoshti,
        register,
        shared.newJoiners,
      ]
    : [
        register,
        shared.newJoiners,
        // Phase 2 slice 8 (docs/DECISIONS.md #65): C19 inventory, C20 duty roster.
        { key: 'instruments', icon: 'drum', tone: 'teal', label: t('modules.instruments'), onPress: () => router.push('/staff/inventory') },
        { key: 'duty', icon: 'time', tone: 'teal', label: t('duty.title'), onPress: () => router.push('/staff/duty') },
        shared.assessments,
        shared.syllabus,
        shared.events,
        shared.ishtagoshti,
      ];
  return <ModuleRing modules={[...own, ...ring]} />;
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
            { key: 'followUps', icon: 'calls', label: t('home.guru.followUps'), href: '/staff/follow-ups-by-coordinator' },
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
      { key: 'notifications', icon: 'bell', label: t('inbox.title'), href: '/staff/notifications' },
    ],
  });
  return groups;
}

/** Opens My profile from the person's card at the top of the side menu (#360). */
export function openMyProfile() {
  router.push('/staff/profile');
}

/** Opens a side-menu line's screen on top of the tabs. */
export function openMenuItem(item: MenuItem) {
  router.push(item.href);
}
