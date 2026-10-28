// The rhythm games' frame and parts (docs/RHYTHM_PLAYGROUND.md §7.2, §7.3, §7.11, §7.12; docs/DECISIONS.md #750): the
// shared Playground shell (W1's GameShell, InstructionsPreview, FeedbackPanel, RoundSummary) around one round of
// useRhythmRound, with the step choice; the big tap circle; a row of beats with the one being heard lit; and how a run
// of taps went in words — "Steady", "A little rushed", "A little slow" — with a calm line of the taps. On a phone not
// tuned the timing is practice only and no timing word is shown (§7.2, spec §11).

import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { type IconName } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { FeedbackPanel } from '@/components/playground/feedback-panel';
import { GameShell } from '@/components/playground/game-shell';
import { InstructionsPreview } from '@/components/playground/instructions-preview';
import { RoundSummary } from '@/components/playground/round-summary';
import { useQueuedRoundCount } from '@/lib/playground/round-queue';
import type { PadHand, PulseResult } from '@/lib/tap-grading';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { leaveGame } from './game-parts';
import type { RhythmRound } from './use-rhythm-round';

/** Props for RhythmFrame. */
export type RhythmFrameProps = {
  game: RhythmRound;
  title: string;
  instructions: readonly string[];
  icon: IconName;
  /** The challenge (what to play, the pad, the question). */
  children: ReactNode;
  /** After a pick: the answer as written, and "Listen again" (plays the prompt again). */
  answerText?: string;
  onListenAgain?: () => void;
  /** A run is sounding: Exit stops it first. */
  onExit?: () => void;
  /** Shown instead of the round (Free play of the tap pad and Echo me). */
  replace?: ReactNode;
  /** Above everything (the Rounds / Free play choice). */
  top?: ReactNode;
};

/** The frame around one rhythm round. */
export function RhythmFrame({ game, title, instructions, icon, children, answerText, onListenAgain, onExit, replace, top }: RhythmFrameProps) {
  const { t } = useTranslation();
  const waiting = useQueuedRoundCount(game.profileId);
  const { phase, round, at, advice, summary, challenge } = game;
  const playing = phase === 'playing' && round ? round : null;
  const picked = game.outcome === 'right' || game.outcome === 'again' || game.outcome === 'shown';
  const exit = () => {
    onExit?.();
    leaveGame();
  };
  return (
    <>
      <Stack.Screen options={{ title, headerShown: false }} />
      <GameShell
        title={title}
        onExit={exit}
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
                <InstructionsPreview lines={instructions} icon={icon} step={game.step} startLabel={t('playground.round.start')} onStart={() => game.start()} />
              </>
            ) : null}

            {playing ? (
              <>
                {playing.challenges.length === 0 ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
                {challenge ? (
                  <>
                    {children}
                    {picked ? (
                      <FeedbackPanel
                        right={game.outcome === 'right'}
                        answerLabel={answerText}
                        triesLeft={game.outcome === 'again' ? game.triesLeft : 0}
                        onListenAgain={onListenAgain}
                        onNext={game.outcome === 'again' ? game.retry : game.next}
                        last={game.last}
                      />
                    ) : null}
                    {game.outcome === 'ran' ? (
                      <Button size="large" icon={game.last ? 'tick' : 'chevron'} label={t(game.last ? 'playEngine.feedback.finish' : 'playEngine.feedback.next')} onPress={game.next} />
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {phase === 'summary' && summary ? (
              <>
                {!game.tuned ? <Notice tone="info">{t('playground.rhythm.practiceOnly')}</Notice> : null}
                <RoundSummary
                  right={summary.judged > 0 ? summary.right : undefined}
                  total={summary.judged > 0 ? summary.judged : undefined}
                  offer={advice && advice.offerStep !== null ? advice.offer : null}
                  onTakeOffer={() => game.start(advice?.offerStep ?? undefined)}
                  waiting={waiting}
                  onPlayAgain={() => game.start(game.step)}
                  onBack={leaveGame}
                />
              </>
            ) : null}
          </>
        )}
      </GameShell>
    </>
  );
}

/** The big round pad: tap the beat (or sam). Reacts on touch-down, as the tap pad does. */
export function BigTapPad({ onTap, label, lit = false, hand = 'right' }: { onTap: (hand: PadHand) => void; label: string; lit?: boolean; hand?: PadHand }) {
  const { colors } = useTheme();
  const tap = () => onTap(hand);
  return (
    <View style={styles.padWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        {...(Platform.OS === 'web' ? { onPointerDown: tap } : { onPressIn: tap })}
        style={({ pressed }) => [
          styles.pad,
          { backgroundColor: pressed ? colors.primary : lit ? colors.primarySoft : colors.surface, borderColor: lit ? colors.accent : colors.primary },
        ]}
      >
        <AppText variant="subtitle" style={styles.centre}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}

/** A row of beats (written bols, or dots), the one being heard lit and the sam marked X. */
export function BeatRow({ cells, current, sam = [], label }: { cells: readonly string[]; current: number | null; sam?: readonly number[]; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessible={Boolean(label)} accessibilityLabel={label}>
      {cells.map((c, i) => (
        <View
          key={i}
          style={[styles.cell, { borderColor: i === current ? colors.accent : colors.border, backgroundColor: i === current ? colors.primarySoft : 'transparent' }]}
        >
          <AppText variant="label" family="sans">
            {c}
          </AppText>
          {sam.includes(i) ? (
            <AppText variant="small" tone="muted">
              X
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** How a run of taps went: the words, how many beats were tapped, and the line of the taps. */
export function PulseResultView({ result, tuned, what = 'beats' }: { result: PulseResult; tuned: boolean; what?: 'beats' | 'sam' }) {
  const { t } = useTranslation();
  const verdict = tuned && result.verdict ? t(`playground.rhythm.verdict.${result.verdict}`) : null;
  return (
    <View style={styles.result} accessible accessibilityLiveRegion="polite">
      {verdict ? <AppText variant="title">{verdict}</AppText> : null}
      <AppText>{t(what === 'sam' ? 'playground.rhythm.tappedSam' : 'playground.rhythm.tapped', { n: result.tapped, of: result.expected })}</AppText>
      {!tuned ? (
        <AppText variant="small" tone="muted">
          {t('playground.rhythm.practiceOnly')}
        </AppText>
      ) : null}
      <TapLine errorsMs={result.errorsMs} />
    </View>
  );
}

/** A calm "heartbeat line": one dot per beat, above the line when early, below when late; a ring when not tapped. */
export function TapLine({ errorsMs }: { errorsMs: readonly (number | null)[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (errorsMs.length === 0) return null;
  return (
    <View style={styles.line} accessible accessibilityLabel={t('playground.rhythm.lineSaid')}>
      <View style={[styles.mid, { backgroundColor: colors.border }]} />
      {errorsMs.map((e, i) => {
        const left = `${((i + 0.5) / errorsMs.length) * 100}%` as const;
        const y = e === null ? 0 : Math.max(-1, Math.min(1, e / 150)) * 18;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              { left, top: 22 + y, borderColor: colors.primary, backgroundColor: e === null ? 'transparent' : colors.primary },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { textAlign: 'center' },
  padWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  pad: { width: 200, height: 200, borderRadius: 100, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  cell: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.xs, borderWidth: 2, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  result: { gap: spacing.xs, alignItems: 'center' },
  line: { width: '100%', height: 56 },
  mid: { position: 'absolute', left: 0, right: 0, top: 27, height: 2 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginLeft: -6 },
});
