// The student's bell (docs/DECISIONS.md #672; Sarvesh Prji's student spec, section 1): Updates, the class's
// announcements, with how many are not opened yet. On the home band and at the right of every student tab's header
// bar; Updates was a tab of its own until #670. The number is asked for each time the screen comes into view (the
// badge call of the home ring, ids and my reads only, P5-06); without internet the bell shows no number. The
// notifications inbox (A2) moved to Me with its own count. Drawn like the staff bell (components/inbox-bell.tsx).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { fetchMyUnreadCount } from '@/data/announcements';
import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for UpdatesBell. */
export type UpdatesBellProps = {
  /** band: the home's header band (40 px, ringed); bar: a header bar (no ring). */
  place: 'band' | 'bar';
};

/** The bell to Updates with the unread count. */
export function UpdatesBell({ place }: UpdatesBellProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      let cancelled = false;
      void fetchMyUnreadCount(myId).then((n) => {
        if (!cancelled && n !== null) setUnread(n);
      });
      return () => {
        cancelled = true;
      };
    }, [myId]),
  );

  const label = unread > 0 ? t('updates.bellUnread', { count: unread }) : t('announcements.title');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.push('/student/announcements')}
      style={({ pressed }) => [styles.bell, place === 'band' ? { borderWidth: 1, borderColor: colors.onHeaderMuted } : null, pressed && styles.pressed]}>
      <Icon name="bell" size={24} color={colors.onHeader} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.onHeader }]}>
          {/* Capped as the staff bell's (P3-08); the label says the number. */}
          <AppText variant="small" maxFontSizeMultiplier={1.3} style={[styles.count, { color: colors.headerTop }]}>
            {unread > 99 ? '99+' : String(unread)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 22,
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontWeight: '700',
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
