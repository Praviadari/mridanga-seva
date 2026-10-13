// What the coordinator and Guru homes show between the header and the circles (audit phase 5 U1-01, U1-08,
// U4-01; docs/DECISIONS.md #339, #340): a "Today" line of tappable numbers (here now, visits today; the
// Guru also who came this week), one big "Scan at the door" button that opens Mark attendance with the
// camera on, and "Waiting for you": one row per thing that waits for this person, most urgent first,
// none when nothing waits. Numbers from staff_dashboard() (src/data/home.ts), loaded by the home. While
// loading the numbers show "–", never 0. The circles (components/staff-shortcuts.tsx) stay as #240 made them.

import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StaffDashboard } from '@/data/home';
import { radii } from '@/theme/tokens.generated';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { ListRow } from './list-row';

/** Props for StaffToday. */
export type StaffTodayProps = {
  guru: boolean;
  /** undefined = loading, null = could not load (the home shows its own notice). */
  board: StaffDashboard | null | undefined;
};

/** Opens Mark attendance (the tab, not a second copy of it: R4-01) with the camera on. */
export function openScanner() {
  // A new value each time, so the tab opens the camera again when it is already open behind the home.
  router.navigate({ pathname: '/staff/attendance', params: { scan: String(Date.now()) } });
}

/** The Today line, the Scan button and Waiting for you. */
export function StaffToday({ guru, board }: StaffTodayProps) {
  const { t } = useTranslation();
  const value = (n: number | undefined) => (board ? n : undefined);
  const today: TodayItem[] = [
    { key: 'here', icon: 'hereNow', count: value(board?.hereNow), label: t('home.today.hereNow'), href: '/staff/here-now' },
    {
      key: 'visits',
      icon: 'visits',
      count: value(board?.visitsToday),
      label: t('home.today.visitsToday', { count: board?.visitsToday ?? 0 }),
      href: '/staff/mark-attendance',
    },
  ];
  if (guru) {
    today.push({
      key: 'week',
      icon: 'students',
      count: value(board?.cameThisWeek),
      label: t('home.today.cameThisWeek', { count: board?.cameThisWeek ?? 0 }),
      href: '/staff/overview',
    });
  }
  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        {today.map((item) => (
          <TodayChip key={item.key} item={item} />
        ))}
      </View>
      <Button size="large" icon="attendance" label={t('home.today.scan')} onPress={openScanner} />
      {board ? <WaitingForYou guru={guru} board={board} /> : null}
    </View>
  );
}

type TodayItem = { key: string; icon: IconName; count: number | undefined; label: string; href: Href };

/** One number of the Today line: tap to open its list. */
function TodayChip({ item }: { item: TodayItem }) {
  const { colors } = useTheme();
  const shown = item.count === undefined ? '–' : String(item.count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shown} ${item.label}`}
      onPress={() => router.push(item.href)}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: pressed ? colors.primarySoft : colors.surface, borderColor: colors.cardBorder },
      ]}>
      <Icon name={item.icon} size={18} color={colors.primary} />
      <AppText variant="label">{shown}</AppText>
      <AppText style={styles.chipLabel}>{item.label}</AppText>
    </Pressable>
  );
}

/** What waits for this person, most urgent first; one quiet line when nothing does. */
function WaitingForYou({ guru, board }: { guru: boolean; board: StaffDashboard }) {
  const { t } = useTranslation();
  const all: { key: string; count: number; title: string; open: () => void }[] = [
    {
      key: 'signups',
      count: board.signupsWaiting,
      title: t('home.waiting.signups', { count: board.signupsWaiting }),
      open: () => router.push('/staff/register'),
    },
    {
      key: 'calls',
      count: board.callsDue,
      title: t(guru ? 'home.waiting.callsGuru' : 'home.waiting.calls', { count: board.callsDue }),
      open: () =>
        guru
          ? router.push('/staff/follow-ups-by-coordinator')
          : router.navigate({ pathname: '/staff/follow-up', params: { scope: 'mine' } }),
    },
    {
      key: 'promotions',
      count: board.promotions,
      title: t(guru ? 'home.waiting.promotionsGuru' : 'home.waiting.promotions', { count: board.promotions }),
      open: () => router.push('/staff/promotion'),
    },
    {
      key: 'fund',
      count: board.fundToApprove,
      title: t('home.waiting.fund', { count: board.fundToApprove }),
      open: () => router.push('/staff/fund'),
    },
    {
      key: 'review',
      count: board.toReview,
      title: t('home.waiting.toReview', { count: board.toReview }),
      open: () => router.push('/staff/assessments'),
    },
    {
      key: 'suggestions',
      count: board.suggestions,
      title: t('home.waiting.suggestions', { count: board.suggestions }),
      open: () => router.push('/staff/suggestions'),
    },
  ];
  const rows = all.filter((row) => row.count > 0);

  return (
    <View style={styles.waiting}>
      <AppText variant="subtitle">{t('home.waiting.title')}</AppText>
      {rows.length === 0 ? (
        <AppText tone="muted">{t('home.waiting.nothing')}</AppText>
      ) : (
        // The amber row and its sign say "waits for you"; no icon circle, so the circles stay near the top.
        rows.map((row) => <ListRow key={row.key} title={row.title} highlight="attention" onPress={row.open} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  chipLabel: {
    flexShrink: 1,
  },
  waiting: {
    gap: spacing.sm,
  },
});
