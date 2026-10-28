// Rhythm Switching Challenge, a Rhythm Playground game (docs/RHYTHM_PLAYGROUND.md §7.12; docs/DECISIONS.md #751): the
// beat stays the same, the strokes inside it get faster or slower. An approved cycle of the bank is played in
// sections at different guna (lib/practice-pattern.ts gunaSections: the pulse is identical in every section) and the
// step asks:
// - "name" — one cycle at guna 1, then one at another: how many strokes in each beat now?
// - "tap" — an approved order of switches (e.g. 1 → 2 → 4 → 1), 1-2 cycles each: tap the beat, not the strokes;
//   with the section's name and the subdivision dots shown, then without (cue off).
// Which guna and orders a level may use, and the tempo caps per guna, are the template's data (Prji's D3/D4, not fixed
// here); a guna is never offered above its cap. Feedback is section by section ("steady in dugun, a little rushed into
// chaugun"); speed is never "better".

import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ChoiceCards } from '@/components/playground/choice-cards';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer, type PracticePlayer } from '@/lib/practice-audio';
import { gunaSections, sectionAt } from '@/lib/practice-pattern';
import { challengeRng, playableGuna, switchQuestion, type SwitchQuestion } from '@/lib/playground-games/rhythm';
import { gradePulse, pulseKept, pulsesOf, type PulseResult } from '@/lib/tap-grading';
import { BeatRow, BigTapPad, RhythmFrame, TapLine } from '@/screens/playground/rhythm-parts';
import { useRhythmRound, type RhythmRound } from '@/screens/playground/use-rhythm-round';
import { oncePattern, useTimedRun } from '@/screens/playground/use-timed-run';
import { spacing, useTheme } from '@/theme/use-theme';

/** The words of a guna: Barabar 1×, Dugun 2×, Tigun 3×, Chaugun 4×, Aṭhgun 8× (the taal player's, #491). */
export function gunaName(guna: number, t: TFunction): string {
  switch (guna) {
    case 1:
      return t('practiceExtras.laya1');
    case 2:
      return t('practiceExtras.laya2');
    case 3:
      return t('practiceExtras.laya3');
    case 4:
      return t('practiceExtras.laya4');
    case 8:
      return t('playground.rhythm.switch.laya8');
    default:
      return `${guna}×`;
  }
}

/** The game. */
export function RhythmSwitching() {
  const { t } = useTranslation();
  const game = useRhythmRound('rhythm_switching');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const ask = game.stepParams.ask === 'name' ? 'name' : 'tap';
  const q = questionOf(game);
  return (
    <RhythmFrame
      game={game}
      title={t('playground.game.rhythm_switching.name')}
      instructions={[t(`playground.rhythm.switch.instructions.${ask}`)]}
      icon="level"
      onExit={() => player.stop()}
      answerText={q?.ask === 'name' ? gunaName(q.guna, t) : ''}
    >
      {game.challenge ? <SwitchChallenge key={`${game.round?.recipe.seed}:${game.at}`} game={game} player={player} q={q} /> : null}
    </RhythmFrame>
  );
}

function questionOf(game: RhythmRound): SwitchQuestion | null {
  const c = game.challenge;
  if (!c || !game.round || c.prompt.beats.length === 0) return null;
  const playable = playableGuna(game.guna, game.template, c.prompt.bpm);
  return switchQuestion(c.prompt.beats.length, c.prompt.bpm, playable, game.template, game.stepParams, challengeRng(game.round.recipe.seed, game.at));
}

/** Per section: its guna and how the taps went in it. */
type SectionResult = { guna: number; result: PulseResult };

/** One challenge. */
function SwitchChallenge({ game, player, q }: { game: RhythmRound; player: PracticePlayer; q: SwitchQuestion | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const beats = useMemo(() => game.challenge?.prompt.beats ?? [], [game.challenge]);
  const n = beats.length;
  const bpm = game.challenge?.prompt.bpm ?? 60;
  const built = useMemo(() => (q ? gunaSections(beats, q.sections) : null), [beats, q]);
  const timed = useTimedRun(player);
  const [heardOnce, setHeardOnce] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<SectionResult[] | null>(null);

  if (!q || !built) {
    // Nothing to switch to at this level and tempo (one guna playable): say so; the round goes on.
    return (
      <>
        <Notice tone="info">{t('playground.rhythm.switch.nothing')}</Notice>
        {!game.done ? <Button label={t('playground.rhythm.skip')} onPress={() => game.ran({ given: '-', ok: null })} /> : null}
      </>
    );
  }

  const play = () => {
    if (q.ask === 'name') {
      void timed.run(oncePattern(built.pattern), bpm, 0, () => setHeardOnce(true));
      return;
    }
    setResults(null);
    void timed.run(oncePattern(built.pattern), bpm, Math.min(8, Math.max(2, n)), (taps) => {
      const at = taps.map((tp) => tp.at);
      const per = built.places.map((p) => {
        const pulses = pulsesOf(1, p.length).map((b) => b + p.start);
        const mine = at.filter((x) => x >= p.start - 0.5 && x < p.start + p.length - 0.5);
        return { guna: p.guna, result: gradePulse(mine, pulses, bpm, game.relaxed) };
      });
      const all = gradePulse(at, pulsesOf(1, built.places.reduce((s, p) => s + p.length, 0)), bpm, game.relaxed);
      setResults(per);
      const kept = per.every((s) => pulseKept(s.result, game.tuned) === true);
      game.ran({
        given: per.map((s) => `${s.guna}:${s.result.verdict ?? 'none'}`).join(' '),
        ok: game.tuned ? kept && pulseKept(all, true) === true : null,
        errorsMs: all.errorsMs.filter((e): e is number => e !== null),
      });
    });
  };

  const beat = timed.beat;
  const section = beat === null ? null : sectionAt(built.places, beat);
  const start =
    !game.done && !(q.ask === 'name' && heardOnce) ? (
      <Button size="large" icon={timed.running ? 'pause' : 'play'} label={t(timed.running ? 'practice.stop' : 'playground.rhythm.startRun')} onPress={timed.running ? timed.stop : play} />
    ) : null;

  if (q.ask === 'name') {
    return (
      <>
        <AppText tone="muted">{t('playground.rhythm.switch.nameAsk')}</AppText>
        {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
        {start}
        {timed.running && section ? (
          <AppText variant="label">{t(section.start === 0 ? 'playground.rhythm.switch.first' : 'playground.rhythm.switch.second')}</AppText>
        ) : null}
        {heardOnce && !timed.running ? <Button variant="secondary" icon="listen" label={t('playground.round.hearAgain')} onPress={play} /> : null}
        {heardOnce ? (
          <ChoiceCards
            choices={q.choices.map((c) => ({ key: c, label: gunaName(Number(c), t) }))}
            onChoose={(key) => {
              if (game.done || timed.running) return;
              setPicked(key);
              game.pick(key, key === q.answer);
            }}
            chosen={picked}
            rightKey={game.done ? q.answer : null}
            disabled={game.done || game.outcome === 'again' || timed.running}
          />
        ) : null}
      </>
    );
  }

  const inBeat = beat === null ? 0 : beat % n;
  return (
    <>
      <AppText tone="muted">{t('playground.rhythm.switch.order', { order: q.sections.map((s) => gunaName(s.guna, t)).join(' → ') })}</AppText>
      {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      {start}
      {timed.running && beat === null ? <AppText variant="label">{t('practice.countingIn')}</AppText> : null}
      {timed.running && section && q.cue ? (
        <View style={styles.cue} accessible accessibilityLiveRegion="polite">
          <AppText variant="title">{gunaName(section.guna, t)}</AppText>
          <View style={styles.dots} accessibilityElementsHidden>
            {Array.from({ length: section.guna }, (_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: colors.primary }]} />
            ))}
          </View>
        </View>
      ) : null}
      <BeatRow cells={beats.map((_, i) => String(i + 1))} current={q.cue && beat !== null ? inBeat : null} sam={[0]} />
      {!game.done ? <BigTapPad onTap={timed.tap} label={t('playground.rhythm.switch.pad')} lit={q.cue && beat !== null} /> : null}
      {results ? (
        <View style={styles.results} accessible accessibilityLiveRegion="polite">
          {results.map((s, i) => (
            <AppText key={i}>
              {t('playground.rhythm.switch.sectionLine', {
                guna: gunaName(s.guna, t),
                how: game.tuned && s.result.verdict ? t(`playground.rhythm.verdict.${s.result.verdict}`) : t('playground.rhythm.tapped', { n: s.result.tapped, of: s.result.expected }),
              })}
            </AppText>
          ))}
          {!game.tuned ? (
            <AppText variant="small" tone="muted">
              {t('playground.rhythm.practiceOnly')}
            </AppText>
          ) : null}
          <TapLine errorsMs={results.flatMap((s) => s.result.errorsMs)} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cue: { alignItems: 'center', gap: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { width: 12, height: 12, borderRadius: 6 },
  results: { gap: spacing.xs, alignItems: 'center' },
});
