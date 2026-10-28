// Tāla Cycle Master, a Rhythm Playground game (docs/RHYTHM_PLAYGROUND.md §7.11; docs/DECISIONS.md #753): mātrā,
// recurring cycles and sam. An approved cycle of the bank (its beats and vibhags) is played and the step asks:
// - "restart" — the sound starts part-way through a cycle; tap the place on the grid where it comes back to sam (with
//   the bols shown, then with dots only: heard, not seen);
// - "count" — how many times did the cycle come round? (counted from 1 at sam);
// - "sam" — one cycle sounds, then 1-2 go on in silence; tap the big circle on every sam, the silent ones too, and
//   rejoin. Sam taps are graded against the hidden pulse; their timing counts only on a tuned phone.
// What is asked comes from the round's seed (lib/playground-games/rhythm.ts), so a replay asks the same. Nothing
// sounds until the student taps Start.

import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ChoiceCards } from '@/components/playground/choice-cards';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer, type PracticePlayer } from '@/lib/practice-audio';
import { countInClicks, taalPattern } from '@/lib/practice-pattern';
import { challengeRng, isRestart, samRunPattern, talaQuestion, type TalaQuestion } from '@/lib/playground-games/rhythm';
import { gradePulse, pulseKept, pulsesOf, type PulseResult } from '@/lib/tap-grading';
import { BeatRow, BigTapPad, PulseResultView, RhythmFrame } from '@/screens/playground/rhythm-parts';
import { useRhythmRound, type RhythmRound } from '@/screens/playground/use-rhythm-round';
import { oncePattern, useTimedRun } from '@/screens/playground/use-timed-run';
import { radius, spacing, useTheme } from '@/theme/use-theme';

/** The game. */
export function TalaCycle() {
  const { t } = useTranslation();
  const game = useRhythmRound('tala_cycle');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const ask = game.stepParams.ask === 'count' ? 'count' : game.stepParams.ask === 'sam' ? 'sam' : 'restart';
  return (
    <RhythmFrame
      game={game}
      title={t('playground.game.tala_cycle.name')}
      instructions={[t(`playground.rhythm.tala.instructions.${ask}`), t('playground.rhythm.tala.instructionsCount')]}
      icon="refresh"
      onExit={() => player.stop()}
      answerText={talaAnswerText(game, t)}
    >
      {game.challenge ? <TalaChallenge key={`${game.round?.recipe.seed}:${game.at}`} game={game} player={player} /> : null}
    </RhythmFrame>
  );
}

/** The question of the current challenge (the same for the frame's answer text and the challenge). */
function questionOf(game: RhythmRound): TalaQuestion | null {
  const beats = game.challenge?.prompt.beats ?? [];
  if (!game.round || beats.length === 0) return null;
  return talaQuestion(beats, game.stepParams, challengeRng(game.round.recipe.seed, game.at));
}

function talaAnswerText(game: RhythmRound, t: TFunction): string {
  const q = questionOf(game);
  const n = game.challenge?.prompt.beats.length ?? 0;
  if (!q) return '';
  if (q.ask === 'restart') return t('playground.rhythm.tala.placeAnswer', { n: q.answer });
  if (q.ask === 'count') return t('playground.rhythm.tala.cyclesAnswer', { count: q.cycles, matras: q.cycles * n });
  return '';
}

/** One challenge. */
function TalaChallenge({ game, player }: { game: RhythmRound; player: PracticePlayer }) {
  const { t } = useTranslation();
  const beats = useMemo(() => game.challenge?.prompt.beats ?? [], [game.challenge]);
  const n = beats.length;
  const bpm = game.challenge?.prompt.bpm ?? 60;
  const divisions = game.challenge?.prompt.divisions ?? null;
  const q = useMemo(() => questionOf(game), [game]);
  const timed = useTimedRun(player);
  const [heardOnce, setHeardOnce] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<PulseResult | null>(null);
  const cycle = useMemo(() => taalPattern([...beats]), [beats]);

  /** Plays what the question asks about (never on opening). */
  const play = () => {
    if (!q) return;
    const countIn = countInClicks('taal', 4, divisions ?? []);
    if (q.ask === 'restart') {
      void timed.run(oncePattern(taalPattern(q.heard)), bpm, 0, () => setHeardOnce(true));
    } else if (q.ask === 'count') {
      void timed.run(oncePattern(cycle, q.cycles), bpm, 0, () => setHeardOnce(true));
    } else {
      setResult(null);
      void timed.run(oncePattern(samRunPattern(cycle, q.mute), q.cycles / (1 + q.mute)), bpm, countIn, (taps) => {
        const graded = gradePulse(
          taps.map((tp) => tp.at),
          pulsesOf(n, q.cycles, true),
          bpm,
          game.relaxed,
        );
        setResult(graded);
        game.ran({
          given: `${graded.verdict ?? 'none'} ${graded.tapped}/${graded.expected}`,
          ok: pulseKept(graded, game.tuned),
          errorsMs: graded.errorsMs.filter((e): e is number => e !== null),
        });
      });
    }
  };

  if (!q) return null;
  const beat = timed.beat;
  const choose = (given: string) => {
    if (game.done || timed.running) return;
    setPicked(given);
    game.pick(given, q.ask === 'restart' ? isRestart(q, given) : q.ask === 'count' && given === q.answer);
  };

  const startButton =
    !game.done && !(q.ask !== 'sam' && heardOnce) ? (
      <Button size="large" icon={timed.running ? 'pause' : 'play'} label={t(timed.running ? 'practice.stop' : 'playground.rhythm.startRun')} onPress={timed.running ? timed.stop : play} />
    ) : null;

  const hearAgain =
    heardOnce && !timed.running ? <Button variant="secondary" icon="listen" label={t('playground.round.hearAgain')} onPress={play} /> : null;

  if (q.ask === 'restart') {
    return (
      <>
        <AppText tone="muted">{t('playground.rhythm.tala.restartAsk')}</AppText>
        {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
        {startButton}
        {hearAgain}
        <PlaceGrid
          heard={q.heard}
          showBols={q.grid}
          current={beat}
          chosen={picked}
          right={game.done ? q.right : null}
          disabled={!heardOnce || timed.running || game.done || game.outcome === 'again'}
          onChoose={choose}
        />
      </>
    );
  }

  if (q.ask === 'count') {
    return (
      <>
        <AppText tone="muted">{t('playground.rhythm.tala.countAsk', { n })}</AppText>
        {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
        {startButton}
        {timed.running && beat !== null ? (
          <AppText variant="title" style={styles.centre}>
            {t('playground.rhythm.tala.matra', { n: (beat % n) + 1 })}
          </AppText>
        ) : null}
        {hearAgain}
        {heardOnce ? (
          <ChoiceCards
            choices={q.choices.map((c) => ({ key: c, label: t('playground.rhythm.tala.cycles', { count: Number(c) }) }))}
            onChoose={choose}
            chosen={picked}
            rightKey={game.done ? q.answer : null}
            disabled={game.done || game.outcome === 'again' || timed.running}
          />
        ) : null}
      </>
    );
  }

  // "sam": one cycle sounds, then silence; keep counting and tap sam.
  const cycleIndex = beat === null ? 0 : Math.floor(beat / n);
  const silent = q.mute > 0 && cycleIndex % (1 + q.mute) > 0;
  const showGrid = game.stepParams.grid !== false;
  const cells = beats.map((b, i) => (showGrid ? (b === '-' ? '–' : b.replace(/\./g, ' ')) : String(i + 1)));
  return (
    <>
      <AppText tone="muted">{t('playground.rhythm.tala.samAsk', { count: q.mute })}</AppText>
      {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      {startButton}
      {timed.running && beat === null ? <AppText variant="label">{t('practice.countingIn')}</AppText> : null}
      {timed.running && silent ? <AppText variant="label">{t('playground.rhythm.silent')}</AppText> : null}
      <BeatRow cells={cells} current={showGrid && beat !== null ? beat % n : null} sam={[0]} />
      {!game.done ? <BigTapPad onTap={timed.tap} label={t('playground.rhythm.tala.samPad')} lit={showGrid && beat !== null && beat % n === 0} /> : null}
      {result ? <PulseResultView result={result} tuned={game.tuned} what="sam" /> : null}
    </>
  );
}

/** The heard beats as places to tap: "where did the cycle start again?". */
function PlaceGrid({
  heard,
  showBols,
  current,
  chosen,
  right,
  disabled,
  onChoose,
}: {
  heard: readonly string[];
  showBols: boolean;
  current: number | null;
  chosen: string | null;
  right: readonly number[] | null;
  disabled: boolean;
  onChoose: (given: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {heard.map((b, i) => {
        const key = String(i + 1);
        const text = showBols ? (b === '-' ? '–' : b.replace(/\./g, ' ')) : '•';
        const isRight = right?.includes(i) ?? false;
        const isChosen = chosen === key;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: isChosen }}
            accessibilityLabel={t('playground.rhythm.tala.placeSaid', { n: i + 1, bol: showBols ? text : '' })}
            disabled={disabled}
            onPress={() => onChoose(key)}
            style={[
              styles.place,
              {
                borderColor: isRight ? colors.accent : isChosen ? colors.primary : colors.border,
                backgroundColor: i === current ? colors.primarySoft : colors.surface,
                borderWidth: isRight || isChosen ? 3 : 2,
              },
            ]}
          >
            <AppText variant="small" tone="muted">
              {i + 1}
            </AppText>
            <AppText variant="label" family="sans">
              {text}
            </AppText>
            {isRight ? (
              <AppText variant="small" accessibilityElementsHidden>
                X
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  place: { minWidth: 56, minHeight: 56, padding: spacing.xs, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
});
