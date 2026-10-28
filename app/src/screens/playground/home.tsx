// The Rhythm Playground home (docs/RHYTHM_PLAYGROUND.md §6.1; docs/DECISIONS.md #730), opened from the one large card
// on the Practice tab. Surprise me first, then the games in their groups — Listening, Rhythm, Voice, Kīrtan — as
// circles, three to a row in the indigo and gold of the app; a game not built yet is dimmed with "Coming soon" and is
// not a button (no dead icons). My Playground progress last. The "TEST sounds" badge shows while no recording is
// approved, and a count of rounds still waiting to be sent when there are any.

import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { IconBadge } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { realSoundsReady } from '@/lib/khol-samples';
import { useQueuedRoundCount } from '@/lib/playground/round-queue';
import { PLAYGROUND_GROUPS, type GameTile } from '@/lib/playground-games/catalogue';
import { spacing } from '@/theme/use-theme';

import { TestSoundsBadge } from './game-parts';

/** The home. */
export function PlaygroundHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const waiting = useQueuedRoundCount(profile?.id);
  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('playground.title') }} />
      <TestSoundsBadge shown={!realSoundsReady()} />
      <AppText tone="muted">{t('playground.intro')}</AppText>
      {waiting > 0 ? <AppText tone="muted">{t('playground.round.waiting', { count: waiting })}</AppText> : null}
      <ListRow
        leading="play"
        title={t('playground.surprise')}
        details={[t('playground.surpriseDetail'), t('playground.comingSoon')]}
      />
      {PLAYGROUND_GROUPS.map(({ group, games }) => (
        <Section key={group} title={t(`playground.group.${group}`)}>
          <View style={styles.grid}>
            {games.map((tile) => (
              <GameCircle key={tile.game} tile={tile} />
            ))}
          </View>
        </Section>
      ))}
      <ListRow
        leading="score"
        title={t('playground.progressLink')}
        details={[t('playground.progressDetail')]}
        onPress={() => router.push('/student/playground/progress')}
      />
    </Screen>
  );
}

/** One game: a circle with its name under it; dimmed and not a button while it is coming. */
function GameCircle({ tile }: { tile: GameTile }) {
  const { t } = useTranslation();
  const name = t(`playground.game.${tile.game}.name`);
  const route = tile.route;
  if (!route) {
    return (
      <View style={[styles.cell, styles.soon]} accessible accessibilityLabel={t('playground.comingSoonSaid', { name })}>
        <IconBadge name={tile.icon} size={64} plain />
        <AppText variant="label" style={styles.name}>
          {name}
        </AppText>
        <AppText variant="small" tone="muted" style={styles.name}>
          {t('playground.comingSoon')}
        </AppText>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${t(`playground.game.${tile.game}.detail`)}`}
      onPress={() => router.push(route)}
      style={({ pressed }) => [styles.cell, pressed ? styles.pressed : null]}
    >
      <IconBadge name={tile.icon} size={64} tone="indigo" solid />
      <AppText variant="label" style={styles.name}>
        {name}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  cell: { width: '33.33%', minHeight: 112, alignItems: 'center', gap: spacing.xs, paddingHorizontal: 2 },
  soon: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  name: { textAlign: 'center' },
});
