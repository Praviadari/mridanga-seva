// The ways to the staff screens from the coordinator dashboard (C1) and the Guru dashboard (G1):
// a big "Mark attendance" button (C5) at the top of the page, since coordinators do it most during
// the class, and icon tiles for the screens that have no tab: who is here now (C6), register a
// student (C2) and groups. One component, so both homes offer the same screens in the same order.

import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { IconBadge, type IconName } from './icon';

/** The main action of a staff home: opens Mark attendance (C5). */
export function MarkAttendanceButton() {
  const { t } = useTranslation();
  return (
    <Button size="large" icon="attendance" label={t('staff.markAttendance')} onPress={() => router.push('/staff/attendance')} />
  );
}

/** A titled grid of icon tiles, one per staff screen. */
export function StaffShortcuts() {
  const { t } = useTranslation();
  const shortcuts: { icon: IconName; label: string; href: Href }[] = [
    // Attendance, Students, Follow-up calls and Announcements are tabs (app/staff/(tabs)/_layout.tsx).
    { icon: 'hereNow', label: t('staff.hereNow'), href: '/staff/here-now' },
    { icon: 'register', label: t('staff.registerStudent'), href: '/staff/register' },
    { icon: 'groups', label: t('groups.title'), href: '/staff/groups' },
  ];
  return (
    <View style={styles.block}>
      <AppText variant="subtitle">{t('home.staff.shortcuts')}</AppText>
      <View style={styles.grid}>
        {shortcuts.map((s) => (
          <ShortcutTile key={s.label} icon={s.icon} label={s.label} onPress={() => router.push(s.href)} />
        ))}
      </View>
    </View>
  );
}

/** One tile: an icon over the screen's name; the whole tile is the button. */
function ShortcutTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        // Three in a row, also on a 375 px phone (about 108 px each; long labels wrap).
        { flexBasis: '30%' },
        cardLook(colors),
        pressed && styles.pressed,
      ]}>
      <IconBadge name={icon} size={44} />
      <AppText variant="label" style={styles.centre}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  centre: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
