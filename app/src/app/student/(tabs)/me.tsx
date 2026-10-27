// The Me tab (docs/DECISIONS.md #670, #677; Sarvesh Prji's student spec, section 1): who I am (the roll card's name,
// roll number and level) with My QR, then my attendance (S9), My Details (About you), the notifications inbox (A2,
// with its count; the bell at the top is Updates since #672), language and appearance (My profile, A3), Privacy &
// Data, What's new, Help, and Sign out, which warns while saves wait on this phone (components/sign-out-button.tsx,
// #678). My profile's person button left the home band for this tab. A tab of the first web download, so it holds
// only rows; each opens its screen from the student area (#650).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { PersonHeader } from '@/components/person-header';
import { Screen } from '@/components/screen';
import { SignOutButton } from '@/components/sign-out-button';
import { VersionLine } from '@/components/update-notice';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchUnreadCount } from '@/data/notifications';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

/** The Me tab. */
export default function StudentMeTab() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const [home, setHome] = useState<StudentHome | 'not_found' | null>(null);
  const [unread, setUnread] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([fetchStudentHome({ weekStarts: false }), fetchUnreadCount()]).then(([loaded, n]) => {
        if (cancelled) return;
        if (loaded) setHome(loaded);
        setUnread(n);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const mine = home && home !== 'not_found' ? home : null;
  const name = mine?.fullName.trim() || profile?.full_name.trim() || '—';
  return (
    <Screen underHeader>
      <View style={[styles.card, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
        <PersonHeader
          name={name}
          chips={mine ? { levelId: mine.levelId } : undefined}
          details={mine?.rollNo ? [t('myProfile.rollLine', { rollNo: mine.rollNo })] : []}
        />
        <Button icon="qr" label={t('myQr.open')} onPress={() => router.push('/student/my-qr')} />
        <AppText variant="small" tone="muted">
          {t('meTab.qrDetail')}
        </AppText>
      </View>
      <ListRow leading="visits" title={t('visitHistory.title')} onPress={() => router.push('/student/visits')} />
      <ListRow leading="about" title={t('about.title')} onPress={() => router.push('/student/about-you')} />
      <ListRow
        leading="bell"
        title={t('inbox.title')}
        details={unread > 0 ? [t('home.badges.new', { count: unread })] : []}
        highlight={unread > 0 ? 'attention' : undefined}
        onPress={() => router.push('/student/notifications')}
      />
      <ListRow leading="language" title={t('meTab.settings')} details={[t('meTab.settingsDetail')]} onPress={() => router.push('/student/profile')} />
      <ListRow leading="guardian" title={t('dataRights.title')} onPress={() => router.push('/student/my-data')} />
      <ListRow leading="newJoiner" title={t('whatsNew.title')} onPress={() => router.push('/student/whats-new')} />
      <ListRow leading="info" title={t('meTab.help')} onPress={() => setHelpOpen((o) => !o)} />
      {helpOpen ? <AppText>{t('meTab.helpBody')}</AppText> : null}
      <SignOutButton icon="signOut" />
      <VersionLine />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
});
