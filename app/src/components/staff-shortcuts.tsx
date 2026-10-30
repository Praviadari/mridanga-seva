// Where every staff screen is offered, for the coordinator home (C1) and the facilitator's home (G1). Since the launch
// UI (14-10-2026, Praveen: "too many icons on the Guru dashboard"; docs/DECISIONS.md #350, #351) and again since the
// ring homes (Praveen 30-10-2026: every home a ring, no scrolling, the rest in the side menu; #777-#779) there are
// three places, each holding a screen once:
// - the bottom tabs (staff/(tabs)/_layout.tsx): Home, Check-in (C5), Students (C7), Follow-ups (C10) and News
//   (C15), used every class or every week by everyone; no circle repeats a tab (Praveen 14-10-2026);
// - the ring on the home (components/home-ring.tsx): eight circles around the drum, like the student home; a red
//   count on a circle says something waits behind it;
// - the side menu (components/side-menu.tsx, from the menu button in the header): the Today boxes at the top
//   (components/staff-today.tsx, #778), then everything else in groups (staffMenuGroups below).
// One file, so the three never offer a screen twice or forget one (tests/launch-ui.test.mjs checks every
// staff screen of the old home and of Running the class is still in one of them).
//
// Facilitator ring (FacilitatorRing below): eight of the eleven modules of lib/facilitator-modules.ts, each opening its
// landing screen: Teaching, Coordinators, Students, Events & Seva, Reports, Funds, Inventory, Admin. The side menu
// holds the other three: Media (Coming soon), Security & Audits, Settings (#777, amends #700, #705).
// Coordinator ring (StaffModules below): Welcome desk, Newcomers, Instruments (drums lent at class), Seva roster,
// Assessments, Lessons, Events & polls, Ishtagoshti.
// Me (0053, docs/DECISIONS.md #316, #319), when the facilitator has linked the person's login to their own student
// record: My QR, My progress, My attendance and Practice as a student sees them (staff/me). For a coordinator it is
// the first line of the side menu's Me group since #780 (it was a ninth circle, whose Telugu labels crowded at 360 px);
// hidden without an own record. The facilitator's Me is in Settings → Personal.

import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { StaffDashboard } from '@/data/home';
import { FACILITATOR_MENU, FACILITATOR_RING, facilitatorModule, type FacilitatorModuleKey } from '@/lib/facilitator-modules';

import { HomeRing } from './home-ring';
import type { IconName } from './icon';
import type { Module } from './module-ring';

/** What waits behind each circle of the facilitator's ring (the parts of the To do total, staff-today.tsx waitingTotal). */
export function facilitatorRingCounts(board: StaffDashboard): Partial<Record<FacilitatorModuleKey, number>> {
  return {
    // Level-ups to decide, recordings to review, material suggestions: all Teaching's rows.
    teaching: board.promotions + board.toReview + board.suggestions,
    // Follow-ups overdue or escalated: Coordinators → Follow-ups by coordinator.
    coordinators: board.callsDue,
    // Sign-ups waiting at the Welcome desk: Students → Registration.
    students: board.signupsWaiting,
    funds: board.fundToApprove,
  };
}

/** The facilitator's Home ring (#777): eight modules, each opening its landing screen, with what waits behind it. */
export function FacilitatorRing({ board }: { board: StaffDashboard | null | undefined }) {
  const { t } = useTranslation();
  const counts = board ? facilitatorRingCounts(board) : {};
  const modules = FACILITATOR_RING.flatMap((key): Module[] => {
    const module = facilitatorModule(key);
    if (!module) return [];
    const count = counts[key] ?? 0;
    return [
      {
        key,
        icon: module.icon,
        tone: module.tone,
        label: t(module.label),
        badge: count,
        badgeSpoken: t('home.badges.waiting', { count }),
        onPress: () => router.push({ pathname: '/staff/modules/[key]', params: { key } }),
      },
    ];
  });
  return <HomeRing modules={modules} />;
}

/** Props for StaffModules. */
export type StaffModulesProps = {
  /** The home's numbers, for the counts on the circles; undefined while loading, null when they could not load. */
  board?: StaffDashboard | null;
};

/** The ring of the coordinator home (the facilitator's is FacilitatorRing above): always eight (#780). */
export function StaffModules({ board }: StaffModulesProps) {
  const { t } = useTranslation();
  const signups = board?.signupsWaiting ?? 0;
  const toReview = board?.toReview ?? 0;
  // Colour by family (UI audit fix 9, docs/DECISIONS.md #368; lib/module-tone.ts), and the circles of a family side by
  // side, so the ring reads as a few coloured arcs: green people, teal seva, purple learning, orange community.
  const ring: Module[] = [
    // The desk, where sign-ups are accepted and students registered.
    // A count on a circle says something waits behind it (#777): sign-ups at the desk, recordings to review.
    {
      key: 'register',
      icon: 'register',
      tone: 'green',
      label: t('staff.registerStudent'),
      badge: signups,
      badgeSpoken: t('home.badges.waiting', { count: signups }),
      onPress: () => router.push('/staff/register'),
    },
    { key: 'newJoiners', icon: 'newJoiner', tone: 'green', label: t('home.modules.newJoiners'), onPress: () => router.push('/staff/new-joiners') },
    // Phase 2 slice 8 (docs/DECISIONS.md #65): C19 inventory, C20 duty roster.
    { key: 'instruments', icon: 'drum', tone: 'teal', label: t('modules.instruments'), onPress: () => router.push('/staff/inventory') },
    { key: 'duty', icon: 'time', tone: 'teal', label: t('duty.title'), onPress: () => router.push('/staff/duty') },
    // Phase 2 (docs/DECISIONS.md #52).
    {
      key: 'assessments',
      icon: 'assessment',
      tone: 'purple',
      label: t('assessments.title'),
      badge: toReview,
      badgeSpoken: t('home.badges.waiting', { count: toReview }),
      onPress: () => router.push('/staff/assessments'),
    },
    { key: 'syllabus', icon: 'library', tone: 'purple', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    // Phase 2 slice 5: events and polls (C16, C17; docs/DECISIONS.md #61).
    { key: 'events', icon: 'events', tone: 'orange', label: t('events.module'), onPress: () => router.push('/staff/events') },
    // On a phone the Ishtagoshti tab does not fit the bottom bar; this opens the tab itself.
    { key: 'ishtagoshti', icon: 'ishtagoshti', tone: 'orange', label: t('ishtagoshti.title'), onPress: () => router.push('/staff/ishtagoshti') },
  ];
  return <HomeRing modules={ring} />;
}
/** One line of the side menu. */
export type MenuItem = {
  key: string;
  icon: IconName;
  /** Already translated. */
  label: string;
  href: Href;
  /** Nothing built yet (Media): dimmed, "Coming soon", not a button (#703). */
  soon?: boolean;
};

/** A group of the side menu, with its heading. */
export type MenuGroup = { key: string; title: string; items: MenuItem[] };

/**
 * The side menu's groups for this role, under its Today boxes (#778). The facilitator (#777, amends #705): the three
 * modules that are not on the Home ring, each opening its landing screen, Media dimmed as Coming soon; the bell and the
 * person's card at the top cover notifications and My profile. A coordinator: every staff screen that is neither a
 * bottom tab nor a circle on their home. The menu opens them with router.push (only stack screens here, never a tab:
 * R4-01).
 */
export function staffMenuGroups(guru: boolean, t: TFunction, me = false): MenuGroup[] {
  if (guru) {
    return [
      {
        key: 'modules',
        title: t('menu.groups.modules'),
        items: FACILITATOR_MENU.flatMap((key) => facilitatorModule(key) ?? []).map((m) => ({
          key: m.key,
          icon: m.icon,
          label: t(m.label),
          href: { pathname: '/staff/modules/[key]', params: { key: m.key } },
          soon: m.soon,
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
      items: [
        // Me (0053) with an own student record: here since #780, so the ring keeps eight circles.
        ...(me ? [{ key: 'me', icon: 'person', label: t('me.title'), href: '/staff/me' } satisfies MenuItem] : []),
        { key: 'notifications', icon: 'bell', label: t('inbox.title'), href: '/staff/notifications' },
      ],
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
