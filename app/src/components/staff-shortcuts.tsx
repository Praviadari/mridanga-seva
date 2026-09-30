// The buttons to the staff screens, shown on the coordinator dashboard (C1) and the Guru
// dashboard (G1): mark attendance (C5), who is here now (C6), students (C7), follow-up calls (C10),
// announcements (C15), groups, and register a student (C2). One list, so both homes offer the
// same screens in the same order. Replaces the temporary role-home.tsx.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import { Section } from './section';

/** A titled card with one button per staff screen. */
export function StaffShortcuts() {
  const { t } = useTranslation();
  return (
    <Section title={t('home.staff.shortcuts')}>
      {/* Attendance first: it is what coordinators do most during the class. */}
      <Button label={t('staff.markAttendance')} onPress={() => router.push('/staff/attendance')} />
      <Button variant="secondary" label={t('staff.hereNow')} onPress={() => router.push('/staff/here-now')} />
      <Button variant="secondary" label={t('staff.students')} onPress={() => router.push('/staff/students')} />
      <Button variant="secondary" label={t('staff.followUp')} onPress={() => router.push('/staff/follow-up')} />
      <Button
        variant="secondary"
        label={t('announcements.title')}
        onPress={() => router.push('/staff/announcements')}
      />
      <Button variant="secondary" label={t('groups.title')} onPress={() => router.push('/staff/groups')} />
      <Button
        variant="secondary"
        label={t('staff.registerStudent')}
        onPress={() => router.push('/staff/register')}
      />
    </Section>
  );
}
