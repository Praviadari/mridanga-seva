// "ⓘ What's new" above the version line on My profile (docs/DECISIONS.md #406): opens the release notes
// (src/screens/whats-new.tsx). A small dot shows until What's new has been opened for the newest release on this
// device; it is read again each time My profile comes back to the front, so it goes once the notes were seen.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { RELEASES } from '@/content/whats-new';
import { whatsNewUnseen } from '@/lib/whats-new';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for WhatsNewLink. */
export type WhatsNewLinkProps = {
  /** Which area's copy of the screen to open: the student's or the staff's. */
  area: 'student' | 'staff';
};

/** The info icon and "What's new", with a dot after an update until opened. */
export function WhatsNewLink({ area }: WhatsNewLinkProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [unseen, setUnseen] = useState(() => whatsNewUnseen(RELEASES));
  useFocusEffect(useCallback(() => setUnseen(whatsNewUnseen(RELEASES)), []));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unseen ? t('whatsNew.openNew') : t('whatsNew.open')}
      hitSlop={4}
      onPress={() => router.push(area === 'student' ? '/student/whats-new' : '/staff/whats-new')}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <View>
        <Icon name="info" size={20} color={colors.primary} />
        {unseen ? <View style={[styles.dot, { backgroundColor: colors.danger, borderColor: colors.background }]} /> : null}
      </View>
      <AppText variant="small" tone="primary" style={styles.label}>
        {t('whatsNew.title')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    // A whole 44 px touch target (WCAG 2.5.5), though the icon is small.
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  label: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
