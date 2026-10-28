// How the listening games use the shared Playground frame (components/playground, #728; docs/DECISIONS.md #736): the
// game shell (name, Exit always visible, progress dots, "TEST sounds", "Review practice", "Review"), how to play with
// the step choice the adaptive rules allow and Start, the feedback after each pick, and the round summary with the
// offered step. Nothing sounds until the student taps Start. Also the home's "TEST sounds" badge.

import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon, type IconName } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { FeedbackPanel } from '@/components/playground/feedback-panel';
import { GameShell } from '@/components/playground/game-shell';
import { InstructionsPreview } from '@/components/playground/instructions-preview';
import { RoundSummary } from '@/components/playground/round-summary';
import { useQueuedRoundCount } from '@/lib/playground/round-queue';
import type { Challenge } from '@/lib/playground/types';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import type { GameRound } from './use-game-round';

/** The "TEST sounds" badge of the Playground home, while no recording is approved (§19.3). */
export function TestSoundsBadge({ shown }: { shown: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!shown) return null;
  return (
    <View
      accessible
      accessibilityLabel={`${t('playground.testSounds')}. ${t('playground.testSoundsHint')}`}
      style={[styles.badge, { borderColor: colors.accent, backgroundColor: colors.surface }]}
    >
      <Icon name="instruments" size={18} color={colors.text} />
      <View style={styles.badgeText}>
        <AppText variant="label">{t('playground.testSounds')}</AppText>
        <AppText variant="small" tone="muted">
          {t('playground.testSoundsHint')}
        </AppText>
      </View>
    </View>
  );
}

/** Leaves a game: back where the student came from, or the Playground home. */
export function leaveGame() {
  if (router.canGoBack()) router.back();
  else router.navigate('/student/playground');
}

/** Props for GameFrame. */
export type GameFrameProps = {
  game: GameRound;
  /** The game's name (translated). */
  title: string;
  /** How to play (translated lines). */
  instructions: readonly string[];
  icon: IconName;
  /** Plays a challenge's prompt: after Start, Next and "Listen again" (the student tapped), never on opening. */
  play: (challenge: Challenge) => void;
  /** The challenge (cards, grid, tiles ...). */
  children: ReactNode;
  /** The answer as the cards write it, shown after the last try. */
  answerText: string;
  /** Above the instructions (Sound Detective's Rounds / Free play). */
  top?: ReactNode;
  /** Shown instead of the round (Free play). */
  replace?: ReactNode;
};

/** The game frame around one round. */
export function GameFrame({ game, title, instructions, icon, play, children, answerText, top, replace }: GameFrameProps) {
  const { t } = useTranslation();
  const waiting = useQueuedRoundCount(game.profileId);
  const { phase, round, at, advice, summary, challenge } = game;

  const begin = (step?: number) => {
    const made = game.start(step);
    if (made && made.challenges.length > 0) play(made.challenges[0]);
  };
  const next = () => {
    if (game.outcome === 'again') {
      game.retry();
      return;
    }
    const following = round && !game.last ? round.challenges[at + 1] : null;
    game.next();
    if (following) play(following);
  };

  const playing = phase === 'playing' && round ? round : null;
  return (
    <>
      <Stack.Screen options={{ title, headerShown: false }} />
      <GameShell
        title={title}
        onExit={leaveGame}
        progress={playing ? { current: at, total: playing.challenges.length, done: game.items.map((i) => i.ok ?? null) } : undefined}
        testSounds={game.testSounds}
        lowContent={Boolean(playing?.lowContent)}
        review={Boolean(playing && challenge?.review)}
      >
        {top}
        {replace ?? (
          <>
            {phase === 'loading' ? (
              <>
                <AppText tone="muted">{t('playground.round.loading')}</AppText>
                <LoadingCards />
              </>
            ) : null}
            {phase === 'off' ? <Notice tone="info">{t('playground.round.notReady')}</Notice> : null}
            {phase === 'empty' ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
            {game.load?.offline && phase !== 'loading' ? <Notice tone="info">{t('playground.round.offline')}</Notice> : null}

            {phase === 'ready' ? (
              <>
                {advice?.warmUp ? <AppText tone="muted">{t('playground.round.warmUp')}</AppText> : null}
                {advice && advice.choosable.length > 1 ? (
                  <ChoiceGroup<number>
                    segmented
                    label={t('playground.round.step')}
                    value={game.step}
                    onChange={game.setStep}
                    choices={advice.choosable.map((n) => ({ value: n, label: t('playground.round.stepChoice', { n }) }))}
                  />
                ) : null}
                <InstructionsPreview lines={instructions} icon={icon} step={game.step} startLabel={t('playground.round.start')} onStart={() => begin()} />
              </>
            ) : null}

            {playing ? (
              <>
                {playing.challenges.length === 0 ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
                {challenge ? (
                  <>
                    {children}
                    {game.outcome ? (
                      <FeedbackPanel
                        right={game.outcome === 'right'}
                        answerLabel={answerText}
                        triesLeft={game.outcome === 'again' ? game.triesLeft : 0}
                        onListenAgain={() => {
                          game.replayed();
                          play(challenge);
                        }}
                        onNext={next}
                        last={game.last}
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {phase === 'summary' && summary ? (
              <RoundSummary
                right={summary.correct}
                total={summary.total}
                closePairs={summary.close.map(([a, b]) => t('playground.summary.pair', { a, b }))}
                offer={advice && advice.offerStep !== null ? advice.offer : null}
                onTakeOffer={() => begin(advice?.offerStep ?? undefined)}
                waiting={waiting}
                onPlayAgain={() => begin(game.step)}
                onBack={leaveGame}
              />
            ) : null}
          </>
        )}
      </GameShell>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.sm,
  },
  badgeText: { flex: 1 },
});
