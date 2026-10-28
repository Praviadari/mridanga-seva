// The frame every Playground listening game shares (docs/RHYTHM_PLAYGROUND.md §6.1 game flow, §13.5; docs/DECISIONS.md
// #736): the "TEST sounds" badge, how to play (shown before the first round, open again any time), the step choice
// the adaptive rules allow, "2 of 6" and a "Review" mark on a review item, the feedback in words with an icon (never
// colour alone), Next, and the round's summary with "Play another round", the offered step, "Back to Playground" and
// "Now play it on your khol". Back is always there (the header); nothing sounds until the student taps.

import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import type { Challenge } from '@/lib/playground/types';
import { feedbackIcon, feedbackKey, type PickOutcome } from '@/lib/playground-games/round';
import { radii } from '@/theme/tokens.generated';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import type { GameRound } from './use-game-round';

/** The "TEST sounds" badge: shown on every Playground screen while no recording is approved (§19.3). */
export function TestSoundsBadge({ shown }: { shown: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!shown) return null;
  return (
    <View
      accessible
      accessibilityLabel={`${t('playground.testSounds')}. ${t('playground.testSoundsHint')}`}
      style={[styles.badge, { borderColor: colors.warningBorder, backgroundColor: colors.warningSurface }]}
    >
      <Icon name="alert" size={18} color={colors.warning} />
      <View style={styles.badgeText}>
        <AppText variant="label">{t('playground.testSounds')}</AppText>
        <AppText variant="small" tone="muted">
          {t('playground.testSoundsHint')}
        </AppText>
      </View>
    </View>
  );
}

/** The words after a pick, with an icon; read out once (polite live region). */
export function FeedbackLine({ outcome, answer }: { outcome: PickOutcome | null; answer: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!outcome) return null;
  const tone = outcome === 'right' ? colors.success : colors.primary;
  return (
    <View accessible accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: tone, backgroundColor: colors.surface }]}>
      <Icon name={feedbackIcon(outcome)} size={24} color={tone} />
      <AppText variant="subtitle" style={styles.feedbackText}>
        {t(feedbackKey(outcome), { answer })}
      </AppText>
    </View>
  );
}

/** Props for GameFrame. */
export type GameFrameProps = {
  game: GameRound;
  /** The game's name (translated), for the header. */
  title: string;
  /** How to play (translated). */
  instructions: string;
  /** Plays a challenge's prompt: after Start and after Next (the student tapped), never on opening. */
  play: (challenge: Challenge) => void;
  /** The challenge (cards, grid, tiles ...). */
  children: ReactNode;
  /** The answer as the cards write it, for "It was …". */
  answerText: string;
  /** Above the frame, before a round starts (Sound Detective's Rounds / Free play). */
  top?: ReactNode;
  /** Shown instead of the frame (Free play). */
  replace?: ReactNode;
};

/** The game frame around one challenge. */
export function GameFrame({ game, title, instructions, play, children, answerText, top, replace }: GameFrameProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [howOpen, setHowOpen] = useState(false);
  const { phase, round, at, advice, summary } = game;
  const challenge = game.challenge;

  const begin = (step?: number) => {
    const made = game.start(step);
    if (made && made.challenges.length > 0) play(made.challenges[0]);
  };
  const next = () => {
    const following = round && !game.last ? round.challenges[at + 1] : null;
    game.next();
    if (following) play(following);
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title }} />
      <TestSoundsBadge shown={game.testSounds} />
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
            <Section icon="info" title={t('playground.round.instructions')}>
              <AppText>{instructions}</AppText>
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
              <Button size="large" icon="play" label={t('playground.round.start')} onPress={() => begin()} />
            </Section>
          ) : null}

          {phase === 'playing' && round ? (
            <>
              {round.lowContent ? <Notice tone="info">{t('playground.round.reviewPractice')}</Notice> : null}
              {round.challenges.length === 0 ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
              {challenge ? (
                <>
                  <View style={styles.topRow}>
                    <AppText variant="label">{t('playground.round.itemOf', { n: at + 1, total: round.challenges.length })}</AppText>
                    {challenge.review ? (
                      <View
                        accessible
                        accessibilityLabel={t('playground.round.reviewSaid')}
                        style={[styles.review, { borderColor: colors.controlBorder }]}
                      >
                        <Icon name="refresh" size={16} color={colors.text} />
                        <AppText variant="small">{t('playground.round.review')}</AppText>
                      </View>
                    ) : null}
                    <Button variant="link" label={t('playground.round.hearInstructions')} onPress={() => setHowOpen((o) => !o)} />
                  </View>
                  {howOpen ? <AppText tone="muted">{instructions}</AppText> : null}
                  {children}
                  <FeedbackLine outcome={game.outcome} answer={answerText} />
                  {game.done ? (
                    <Button
                      size="large"
                      icon="chevron"
                      label={game.last ? t('playground.round.finish') : t('playground.round.next')}
                      onPress={next}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {phase === 'summary' && summary ? (
            <Section icon="score" title={t('playground.summary.title')}>
              <View accessible accessibilityLiveRegion="polite">
                <AppText variant="subtitle">{t('playground.summary.recognised', { correct: summary.correct, total: summary.total })}</AppText>
              </View>
              {summary.close.map(([a, b]) => (
                <AppText key={`${a}|${b}`}>{t('playground.summary.close', { a, b })}</AppText>
              ))}
              {summary.review > 0 ? <AppText tone="muted">{t('playground.summary.review', { count: summary.review })}</AppText> : null}
              <AppText tone="muted">{t('playground.summary.saved')}</AppText>
              <Button size="large" icon="play" label={t('playground.summary.again')} onPress={() => begin(game.step)} />
              {advice?.offer && advice.offerStep !== null ? (
                <>
                  <AppText variant="label">{advice.offer === 'harder' ? t('playground.summary.harder') : t('playground.summary.easier')}</AppText>
                  <Button variant="secondary" label={t('playground.summary.goStep', { n: advice.offerStep })} onPress={() => begin(advice.offerStep ?? undefined)} />
                </>
              ) : null}
              <AppText>{t('playground.khol')}</AppText>
              <Button variant="secondary" icon="back" label={t('playground.round.back')} onPress={() => router.navigate('/student/playground')} />
            </Section>
          ) : null}
        </>
      )}
    </Screen>
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
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderRadius: radius,
    padding: spacing.md,
  },
  feedbackText: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
