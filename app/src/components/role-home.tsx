// Temporary home screen for each role, until the real dashboards are built
// (G1 Guru, C1 Coordinator, S1 Student in docs/SCREENS.md).
// Proves that sign-in and role-based navigation work end to end.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';

import { AppText } from './app-text';
import { Button } from './button';
import { Screen } from './screen';

/** Props for RoleHome. */
export type RoleHomeProps = {
  role: 'guru' | 'coordinator' | 'student';
};

/**
 * Greets the person, says which role they are signed in with, and offers sign-out. Guru and
 * coordinators also get the staff screens built so far: mark attendance (C5), who is here now
 * (C6), the student list (C7), the follow-up queue (C10) and register a student (C2).
 */
export function RoleHome({ role }: RoleHomeProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();

  return (
    <Screen centred>
      <AppText variant="title">
        {name ? t('home.greeting', { name }) : t('home.greetingNoName')}
      </AppText>
      <AppText tone="muted">{t('home.role', { role: t(`roles.${role}`) })}</AppText>
      <AppText>{t('home.comingSoon')}</AppText>
      {role !== 'student' ? (
        <>
          {/* Attendance first: it is what coordinators do most during the class. */}
          <Button label={t('staff.markAttendance')} onPress={() => router.push('/staff/attendance')} />
          <Button
            variant="secondary"
            label={t('staff.hereNow')}
            onPress={() => router.push('/staff/here-now')}
          />
          <Button
            variant="secondary"
            label={t('staff.students')}
            onPress={() => router.push('/staff/students')}
          />
          <Button
            variant="secondary"
            label={t('staff.followUp')}
            onPress={() => router.push('/staff/follow-up')}
          />
          <Button
            variant="secondary"
            label={t('staff.registerStudent')}
            onPress={() => router.push('/staff/register')}
          />
        </>
      ) : null}
      <Button variant="secondary" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
