// Where every staff screen is offered, for the coordinator home (C1) and the facilitator's home (G1). Since the
// 11-module Home (28-10-2026, docs/DECISIONS.md #700-#705) the facilitator's screens are all in the module tree
// (lib/facilitator-modules.ts): the Home's circles and the side menu list the same eleven modules, the bottom tabs
// stay as the daily shortcuts. For a coordinator, since the launch UI (14-10-2026, Praveen: "too many icons on the
// Guru dashboard"; docs/DECISIONS.md #350, #351) there are three places, each holding a screen once:
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
// Events & polls, Ishtagoshti. (The facilitator's ring of eight went with #700.)
// In class now and today's check-ins are the Today line above the ring (components/staff-today.tsx).
// Me (0053, docs/DECISIONS.md #316, #319) comes first on the ring when the facilitator has linked the person's login to
// their own student record: My QR, My progress, My attendance and Practice as a student sees them (staff/me). Hidden
// otherwise. The ring then holds nine (module-ring.tsx draws nine smaller).

import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { FACILITATOR_MODULES } from '@/lib/facilitator-modules';

import type { IconName } from './icon';
import { ModuleRing, type Module } from './module-ring';

/** Props for StaffModules. */
export type StaffModulesProps = {
  /** The login has its own student record (0053): show Me. */
  me?: boolean;
};

/** The ring of the coordinator home (the facilitator's Home has the eleven modules, components/facilitator-modules.tsx). */
export function StaffModules({ me = false }: StaffModulesProps) {
  const { t } = useTranslation();
  // Me first, only with an own record (0053): green, people, as About you; on the ring it sits beside the green
  // Welcome desk.
  const own: Module[] = [...(me ? [{ key: 'me', icon: 'person', tone: 'green', label: t('me.title'), onPress: () => router.push('/staff/me') } satisfies Module] : [])];
  // Colour by family (UI audit fix 9, docs/DECISIONS.md #368; lib/module-tone.ts), and the circles of a family side by
  // side, so the ring reads as a few coloured arcs: green people, teal seva, purple learning, orange community.
  const ring: Module[] = [
    // The desk, where sign-ups are accepted and students registered.
    { key: 'register', icon: 'register', tone: 'green', label: t('staff.registerStudent'), onPress: () => router.push('/staff/register') },
    { key: 'newJoiners', icon: 'newJoiner', tone: 'green', label: t('home.modules.newJoiners'), onPress: () => router.push('/staff/new-joiners') },
    // Phase 2 slice 8 (docs/DECISIONS.md #65): C19 inventory, C20 duty roster.
    { key: 'instruments', icon: 'drum', tone: 'teal', label: t('modules.instruments'), onPress: () => router.push('/staff/inventory') },
    { key: 'duty', icon: 'time', tone: 'teal', label: t('duty.title'), onPress: () => router.push('/staff/duty') },
    // Phase 2 (docs/DECISIONS.md #52).
    { key: 'assessments', icon: 'assessment', tone: 'purple', label: t('assessments.title'), onPress: () => router.push('/staff/assessments') },
    { key: 'syllabus', icon: 'library', tone: 'purple', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    // Phase 2 slice 5: events and polls (C16, C17; docs/DECISIONS.md #61).
    { key: 'events', icon: 'events', tone: 'orange', label: t('events.module'), onPress: () => router.push('/staff/events') },
    // On a phone the Ishtagoshti tab does not fit the bottom bar; this opens the tab itself.
    { key: 'ishtagoshti', icon: 'ishtagoshti', tone: 'orange', label: t('ishtagoshti.title'), onPress: () => router.push('/staff/ishtagoshti') },
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
 * The side menu's groups for this role. The facilitator (#705): the eleven Home modules, each opening its landing
 * screen, so every tab screen's menu button reaches the whole tree (a module not built yet is left out: nothing to
 * open); the bell and the person's card at the top cover notifications and My profile. A coordinator: every staff
 * screen that is neither a bottom tab nor a circle on their home. The menu opens them with router.push (only stack
 * screens here, never a tab: R4-01).
 */
export function staffMenuGroups(guru: boolean, t: TFunction): MenuGroup[] {
  if (guru) {
    return [
      {
        key: 'modules',
        title: t('menu.groups.modules'),
        items: FACILITATOR_MODULES.filter((m) => !m.soon && m.roles.includes('guru')).map((m) => ({
          key: m.key,
          icon: m.icon,
          label: t(m.label),
          href: { pathname: '/staff/modules/[key]', params: { key: m.key } },
        })),
      },
    ];
  }
  return [
    {
      key: 'class',
      title: t('menu.groups.class'),
      items: [
        { key: 'overview', icon: 'status', label: t('home.modules.overview'), href: '/staff/overview' },
        { key: 'groups', icon: 'groups', label: t('groups.title'), href: '/staff/groups' },
      ],
    },
    {
      key: 'teaching',
      title: t('menu.groups.teaching'),
      items: [
        { key: 'promotions', icon: 'promote', label: t('home.modules.promotions'), href: '/staff/promotion' },
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
      items: [{ key: 'reports', icon: 'report', label: t('reports.titleCoordinator'), href: '/staff/reports' }],
    },
    {
      key: 'me',
      title: t('menu.groups.me'),
      items: [{ key: 'notifications', icon: 'bell', label: t('inbox.title'), href: '/staff/notifications' }],
    },
  ];
}
/** Opens My profile from the person's card at the top of the side menu (#360). */
export function openMyProfile() {
  router.push('/staff/profile');
}

/** Opens a side-menu line's screen on top of the tabs. */
export function openMenuItem(item: MenuItem) {
  router.push(item.href);
}
