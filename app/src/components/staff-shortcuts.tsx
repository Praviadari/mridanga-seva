// The ways to the staff screens from the coordinator dashboard (C1) and the Guru dashboard (G1):
// a big "Mark attendance" button (C5) at the top of the page, since coordinators do it most during
// the class, and the ring of modules (components/module-ring.tsx) further down: Students (C7),
// Attendance (C5), Who is here now (C6), Follow-up calls (C10), Announcements (C15), Groups,
// Syllabus and lessons (G4 + G5; the Guru edits, coordinators read; round 7), Assessments (Phase 2:
// C12-C14, G6), and
// the two modules not built yet, Instruments and Events, which open the Coming soon screen
// (docs/DECISIONS.md #39). One component, so both homes offer the same screens in the same order.
// Register a student (C2) is the first button on the Students tab.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import { ModuleRing, type Module } from './module-ring';

/** The main action of a staff home: opens Mark attendance (C5). */
export function MarkAttendanceButton() {
  const { t } = useTranslation();
  return (
    <Button size="large" icon="attendance" label={t('staff.markAttendance')} onPress={() => router.push('/staff/attendance')} />
  );
}

/** The ring of modules of a staff home. */
export function StaffShortcuts() {
  const { t } = useTranslation();
  const modules: Module[] = [
    { key: 'students', icon: 'students', tone: 'green', label: t('staff.students'), onPress: () => router.push('/staff/students') },
    { key: 'attendance', icon: 'attendance', tone: 'blue', label: t('tabs.attendance'), onPress: () => router.push('/staff/attendance') },
    { key: 'hereNow', icon: 'hereNow', tone: 'teal', label: t('home.staff.hereNow'), onPress: () => router.push('/staff/here-now') },
    { key: 'calls', icon: 'calls', tone: 'purple', label: t('staff.followUp'), onPress: () => router.push('/staff/follow-up') },
    { key: 'news', icon: 'news', tone: 'orange', label: t('announcements.title'), onPress: () => router.push('/staff/announcements') },
    { key: 'groups', icon: 'groups', tone: 'pink', label: t('groups.title'), onPress: () => router.push('/staff/groups') },
    { key: 'syllabus', icon: 'library', tone: 'indigo', label: t('syllabusEditor.module'), onPress: () => router.push('/staff/levels') },
    // Phase 2 (docs/DECISIONS.md #43): on the phase2 branches only until Praveen decides.
    { key: 'assessments', icon: 'assessment', tone: 'teal', label: t('assessments.title'), onPress: () => router.push('/staff/assessments') },
    {
      key: 'instruments',
      icon: 'instruments',
      label: t('modules.instruments'),
      soon: true,
      onPress: () => router.push({ pathname: '/staff/coming-soon', params: { module: 'instruments' } }),
    },
    {
      key: 'events',
      icon: 'events',
      label: t('modules.events'),
      soon: true,
      onPress: () => router.push({ pathname: '/staff/coming-soon', params: { module: 'events' } }),
    },
  ];
  return <ModuleRing title={t('home.staff.shortcuts')} modules={modules} />;
}
