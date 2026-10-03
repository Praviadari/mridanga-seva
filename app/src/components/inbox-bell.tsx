// The bell at the top right of the home header (S1, C1, G1): opens the notifications inbox (A2)
// and shows how many notices are unread. The number is asked for each time the home comes into
// view; it is one small database call (inbox_unread_count, migration 0015). Without internet, or
// before 0015 is on the project, it shows the bell without a number.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { fetchUnreadCount } from '@/data/notifications';
import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** The inbox button with the unread count. */
export function InboxBell() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const [unread, setUnread] = useState(0);
  const path = profile?.role === 'student' ? '/student/notifications' : '/staff/notifications';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchUnreadCount().then((n) => {
        if (!cancelled) setUnread(n);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const label = unread > 0 ? t('inbox.bellUnread', { count: unread }) : t('inbox.title');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.push(path)}
      style={({ pressed }) => [styles.bell, { borderColor: colors.onHeaderMuted }, pressed && styles.pressed]}>
      <Icon name="bell" size={24} color={colors.onHeader} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.onHeader }]}>
          <AppText variant="small" style={[styles.count, { color: colors.headerTop }]}>
            {unread > 99 ? '99+' : String(unread)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 22,
    height: 22,
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
