// Tempo Detective (docs/RHYTHM_PLAYGROUND.md §7.8; docs/DECISIONS.md #734): the same approved pattern plays twice, A
// then B, both inside its approved tempo range, and the student says whether B was faster, slower or the same. A and
// B can also be heard alone. After the answer both are drawn as rows of beat dots spaced by time (a still picture, so
// reduced motion needs nothing more), with the tempo in words for the screen reader.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer } from '@/lib/practice-audio';
import type { Challenge } from '@/lib/playground/types';
import { beatsPattern, beatTimes, bothPattern } from '@/lib/playground-games/listening';
import { spacing, useTheme } from '@/theme/use-theme';

import { GameFrame } from './game-parts';
import { useGameRound } from './use-game-round';

const ANSWERS = ['faster', 'slower', 'same'] as const;

/** The game. */
export function TempoDetective() {
  const { t } = useTranslation();
  const game = useGameRound('tempo_detective');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const [soundFailed, setSoundFailed] = useState(false);

  const challenge = game.challenge;
  const bpmA = challenge?.prompt.bpm ?? 0;
  const bpmB = challenge?.prompt.second?.bpm ?? bpmA;

  const play = (c: Challenge) => {
    const both = bothPattern(c.prompt.beats, c.prompt.bpm, c.prompt.second?.bpm ?? c.prompt.bpm);
    void player.playOnce(both.pattern, both.bpm).then((ok) => setSoundFailed(!ok));
  };
  const hearOne = (bpm: number) => {
    if (!challenge) return;
    game.replayed();
    void player.playOnce(beatsPattern(challenge.prompt.beats), bpm).then((ok) => setSoundFailed(!ok));
  };

  const choose = (answer: (typeof ANSWERS)[number]) => {
    if (!challenge || game.done) return;
    game.answer(answer);
  };

  const answerText = challenge ? t(`playground.td.${challenge.answer as (typeof ANSWERS)[number]}`) : '';

  return (
    <GameFrame game={game} title={t('playground.game.tempo_detective.name')} instructions={t('playground.td.instructions')} play={play} answerText={answerText}>
      {challenge ? (
        <>
          {soundFailed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
          <Button
            size="large"
            icon="listen"
            label={t('playground.td.hearBoth')}
            onPress={() => {
              game.replayed();
              play(challenge);
            }}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Button variant="secondary" label={t('playground.td.hearA')} onPress={() => hearOne(bpmA)} />
            </View>
            <View style={styles.half}>
              <Button variant="secondary" label={t('playground.td.hearB')} onPress={() => hearOne(bpmB)} />
            </View>
          </View>
          {!game.done ? (
            <View style={styles.answers}>
              {ANSWERS.map((a) => (
                <Button key={a} size="large" label={t(`playground.td.${a}`)} onPress={() => choose(a)} />
              ))}
            </View>
          ) : (
            <BeatDots count={challenge.prompt.beats.length} bpmA={bpmA} bpmB={bpmB} />
          )}
        </>
      ) : null}
    </GameFrame>
  );
}

/** A and B as rows of dots, each dot a beat, spaced by time on one scale. */
function BeatDots({ count, bpmA, bpmB }: { count: number; bpmA: number; bpmB: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const times = beatTimes(count, bpmA, bpmB);
  const longest = Math.max(times.a[count - 1] ?? 0, times.b[count - 1] ?? 0) || 1;
  const row = (name: string, list: number[], bpm: number) => (
    <View accessible accessibilityLabel={t('playground.td.rowSaid', { name, bpm })} style={styles.dotRow}>
      <AppText variant="label" style={styles.dotName}>
        {name}
      </AppText>
      <View style={styles.track}>
        {list.map((s, i) => (
          <View key={i} style={[styles.dot, { left: `${(s / longest) * 92}%`, backgroundColor: colors.primary }]} />
        ))}
      </View>
    </View>
  );
  return (
    <View style={styles.picture}>
      {row('A', times.a, bpmA)}
      {row('B', times.b, bpmB)}
      <AppText variant="small" tone="muted">
        {t('playground.td.picture')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  answers: { gap: spacing.sm },
  picture: { gap: spacing.sm },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  dotName: { width: 24 },
  track: { flex: 1, height: 20 },
  dot: { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8 },
});
