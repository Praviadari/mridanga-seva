// Running the class, from a circle on the Guru home (simple home, docs/DECISIONS.md #240): the
// Guru's own screens (components/admin-links.tsx): G8 Reports, G2 Coordinators, G3 Student
// database, G10 Settings, G9 Centres, G11 Audit log, G12 Option lists, G13 How students found us.
// Guru only: anyone else opening this address gets the same notice as the screens in it.

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AdminLinks } from '@/components/admin-links';
import { GuruOnly } from '@/components/guru-only';
import { Screen } from '@/components/screen';

/** The Guru's admin screens. */
export default function RunningTheClassScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  if (profile?.role !== 'guru') return <GuruOnly title={t('admin.title')} />;
  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('admin.title') }} />
      <AdminLinks />
    </Screen>
  );
}