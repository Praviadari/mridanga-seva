// What the coordinator and Guru homes show between the header and the circles (audit phase 5 U1-01, U1-08, U4-01;
// docs/DECISIONS.md #339, #340; since the launch UI #351): three Today boxes on one line (in class now; check-ins
// today, or this week for the Guru; the "to do" total, amber when anything waits, opening staff/waiting.tsx). The
// big Scan button left the home (Praveen 14-10-2026: Check-in was there twice; the Check-in tab is one tap and starts
// with Scan to check in). WaitingForYou (one row per thing that waits,
// most urgent first) is the To do screen's list. Numbers from staff_dashboard() (src/data/home.ts), loaded by the home.
// While loading the numbers show "–", never 0.

import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StaffDashboard } from '@/data/home';
import { radii } from '@/theme/tokens.generated';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { ListRow } from './list-row';

/** Props for StaffToday. */
export type StaffTodayProps = {
  guru: boolean;
  /** undefined = loading, null = could not load (the home shows its own notice). */
  board: StaffDashboard | null | undefined;
};

/** The Today line: three boxes above the ring (#351). */
export function StaffToday({ guru, board }: StaffTodayProps) {
  const { t } = useTranslation();
  const value = (n: number | undefined) => (board ? n : undefined);
  const waiting = board ? waitingTotal(board) : undefined;
  // Three boxes on one line (#351): in class now; today's check-ins (the Guru: who came this week); and the total
  // of what waits for this person, amber when there is any, opening Waiting for you (staff/waiting.tsx). The middle
  // box is a number only: its screen is already a circle (Overview) or a tab (Check-in), Praveen 14-10-2026.
  const today: TodayItem[] = [
    { key: 'here', icon: 'hereNow', count: value(board?.hereNow), label: t('home.today.hereNow'), href: '/staff/here-now' },
    guru
      ? {
          key: 'week',
          icon: 'students',
          count: value(board?.cameThisWeek),
          label: t('home.today.cameThisWeek', { count: board?.cameThisWeek ?? 0 }),
        }
      : {
          key: 'visits',
          icon: 'visits',
          count: value(board?.visitsToday),
          label: t('home.today.visitsToday', { count: board?.visitsToday ?? 0 }),
        },
    {
      key: 'waiting',
      icon: 'todo',
      count: waiting,
      label: t('home.today.waiting', { count: waiting ?? 0 }),
      href: '/staff/waiting',
      attention: (waiting ?? 0) > 0,
    },
  ];
  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        {today.map((item) => (
          <TodayChip key={item.key} item={item} />
        ))}
      </View>
    </View>
  );
}

/** A box of the Today line; without href it is a number to read, not a button. */
type TodayItem = { key: string; icon: IconName; count: number | undefined; label: string; href?: Href; attention?: boolean };

/** Everything that waits for this person, the sum of Waiting for you's rows. */
export function waitingTotal(board: StaffDashboard): number {
  return board.signupsWaiting + board.callsDue + board.promotions + board.fundToApprove + board.toReview + board.suggestions + board.dataRequests;
}

/** One number of the Today line: a button to its list, or (no `href`) a number to read. */
function TodayChip({ item }: { item: TodayItem }) {
  const { colors } = useTheme();
  const shown = item.count === undefined ? '–' : String(item.count);
  // A box like the website's facts (#351): the number big, its icon, the words under it.
  const content = (
    <>
      <View style={styles.chipTop}>
        <Icon name={item.icon} size={18} color={item.attention ? colors.warning : colors.primary} />
        <AppText variant="number" style={styles.chipNumber}>
          {shown}
        </AppText>
      </View>
      <AppText variant="small" tone="muted" style={[styles.chipLabel, item.attention && { color: colors.text }]}>
        {item.label}
      </AppText>
    </>
  );
  const href = item.href;
  if (!href) {
    // Read as one line; drawn flatter than the buttons beside it (no raised surface), so it does not invite a tap.
    return (
      <View accessible accessibilityLabel={`${shown} ${item.label}`} style={[styles.chip, { borderColor: colors.border }]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shown} ${item.label}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.chip,
        item.attention
          ? { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }
          : { backgroundColor: pressed ? colors.primarySoft : colors.surface, borderColor: colors.cardBorder },
        pressed && item.attention && styles.pressed,
      ]}>
      {content}
      {/* One rule for the boxes (#363): a box that opens a list shows ›; a number-only box has none. */}
      <View style={styles.chevron}>
        <Icon name="chevron" size={16} color={item.attention ? colors.warning : colors.textMuted} />
      </View>
    </Pressable>
  );
}

/** What waits for this person, most urgent first; one quiet line when nothing does. */
export function WaitingForYou({ guru, board, heading = true }: { guru: boolean; board: StaffDashboard; heading?: boolean }) {
  const { t } = useTranslation();
  const all: { key: string; count: number; title: string; open: () => void }[] = [
    // A person's data request first: the law gives 30 days (#551).
    {
      key: 'dataRequests',
      count: board.dataRequests,
      title: t('home.waiting.dataRequests', { count: board.dataRequests }),
      open: () => router.push('/staff/data-requests'),
    },
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
      {heading ? <AppText variant="subtitle">{t('home.waiting.title')}</AppText> : null}
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
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: 60,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.lg,
    justifyContent: 'center',
  },
  chipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipNumber: {
    fontSize: 22,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
  },
  chevron: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  chipLabel: {
    lineHeight: 18,
  },
  waiting: {
    gap: spacing.sm,
  },
});
