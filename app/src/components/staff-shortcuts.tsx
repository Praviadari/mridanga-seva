// The circles of the coordinator home (C1) and the Guru home (G1), simple since 10-10-2026
// (docs/DECISIONS.md #240, #241): eight on the ring around the drum (components/module-ring.tsx), the
// ones used most and the ones that can wait for the person, then two rows of four under it. Mark
// attendance (C5), Students (C7), Calls (C10) and Announcements (C15) are the bottom tabs, so they
// are not circles. One component, so both homes offer the same screens in the same order.
//
// Ring: Overview (staff/overview.tsx: the numbers, each tile opening its filtered list), Follow-up
// calls with the count due (the coordinator's own; for the Guru the overdue and escalated ones per
// coordinator, staff/follow-ups-by-coordinator.tsx), Promotions with the count waiting (C22/C23,
// G7), Who is here now (C6), New joiners (staff/new-joiners.tsx), Assessments (C12-C14, G6), Events &
// polls (C16, C17), My reports (C21) for a coordinator or Running the class (G2, G3, G8-G13,
// staff/running-the-class.tsx) for the Guru. My profile (A3: language, Sign out, version) is the
// person button beside the bell in the header.
// Rows: Syllabus and lessons (G4, G5), Groups, Practice tools (S5), Ishtagoshti (I1; on a phone the
// Slokas tab does not fit the staff bottom bar), Instruments (C19), Duty roster (C20), Material
// suggestions (C18) and the Class fund (#80).

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ModuleRing, type Module } from './module-ring';

/** Props for StaffModules. */
export type StaffModulesProps = {
  guru: boolean;
  /** Calls due for my students (coordinator), or follow-ups overdue or escalated (Guru). */
  callsDue: number;
  /** Feedback asked of me (coordinator), or nominations to decide (Guru). */
  promotionsWaiting: number;
};

/** The circles of a staff home. */
export function StaffModules({ guru, callsDue, promotionsWaiting }: StaffModulesProps) {
  const { t } = useTranslation();
  const ring: Module[] = [
    { key: 'overview', icon: 'status', tone: 'blue', label: t('home.modules.overview'), onPress: () => router.push('/staff/overview') },
    {
      key: 'calls',
      icon: 'calls',
      tone: 'purple',
      label: t('staff.followUp'),
      badge: callsDue,
      badgeSpoken: t('home.badges.due', { count: callsDue }),
      onPress: () =>
        guru
          ? router.push('/staff/follow-ups-by-coordinator')
          : router.push({ pathname: '/staff/follow-up', params: { scope: 'mine' } }),
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
    { key: 'hereNow', icon: 'hereNow', tone: 'teal', label: t('home.staff.hereNow'), onPress: () => router.push('/staff/here-now') },
    { key: 'newJoiners', icon: 'newJoiner', tone: 'orange', label: t('home.modules.newJoiners'), onPress: () => router.push('/staff/new-joiners') },
    // Phase 2 (docs/DECISIONS.md #52).
    { key: 'assessments', icon: 'assessment', tone: 'indigo', label: t('assessments.title'), onPress: () => router.push('/staff/assessments') },
    // Phase 2 slice 5: events and polls (C16, C17; docs/DECISIONS.md #61).
    { key: 'events', icon: 'events', tone: 'pink', label: t('events.module'), onPress: () => router.push('/staff/events') },
    guru
      ? { key: 'admin', icon: 'filter', tone: 'blue', label: t('admin.title'), onPress: () => router.push('/staff/running-the-class') }
      : { key: 'reports', icon: 'report', tone: 'blue', label: t('reports.titleCoordinator'), onPress: () => router.push('/staff/reports') },
  ];
  const more: Module[] = [
    { key: 'syllabus', icon: 'library', tone: 'indigo', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    { key: 'groups', icon: 'groups', tone: 'pink', label: t('groups.title'), onPress: () => router.push('/staff/groups') },
    // Phase 2 slice 3 (S5, docs/DECISIONS.md #54).
    { key: 'practice', icon: 'practice', tone: 'purple', label: t('practice.module'), onPress: () => router.push('/staff/practice') },
    { key: 'ishtagoshti', icon: 'ishtagoshti', tone: 'orange', label: t('ishtagoshti.title'), onPress: () => router.push('/staff/ishtagoshti') },
    // Phase 2 slice 8 (docs/DECISIONS.md #65): C19 inventory, C20 duty roster, C18 material suggestions.
    { key: 'instruments', icon: 'instruments', tone: 'teal', label: t('modules.instruments'), onPress: () => router.push('/staff/inventory') },
    { key: 'duty', icon: 'time', tone: 'blue', label: t('duty.title'), onPress: () => router.push('/staff/duty') },
    { key: 'suggestions', icon: 'feedback', tone: 'green', label: t('suggestions.title'), onPress: () => router.push('/staff/suggestions') },
    // Phase 2 slice 9 (docs/DECISIONS.md #80): the class fund ledger, read by all staff.
    { key: 'fund', icon: 'fund', tone: 'orange', label: t('fund.title'), onPress: () => router.push('/staff/fund') },
  ];
  return <ModuleRing modules={ring} more={more} />;
}
