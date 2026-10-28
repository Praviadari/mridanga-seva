// Missing Beat (docs/RHYTHM_PLAYGROUND.md §7.4; docs/DECISIONS.md #732): an approved pattern plays with one beat (two
// at a higher step) left silent, shown as "?" on the grid when the step shows the grid; the student picks the bol of
// each gap in order from 3-4 large buttons. Afterwards the whole pattern plays with the grid filled in. The gap is the
// approved sequence with a beat left out: nothing new is made.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer } from '@/lib/practice-audio';
import { writtenBeat } from '@/lib/playground/notation';
import type { Challenge } from '@/lib/playground/types';
import { beatsPattern, choiceText, gapsGiven, gridCells, heardBeats } from '@/lib/playground-games/listening';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { GameFrame } from './game-parts';
import { useGameRound } from './use-game-round';

/** The game. */
export function MissingBeat() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const game = useGameRound('missing_beat');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const [picks, setPicks] = useState<string[]>([]);
  const [soundFailed, setSoundFailed] = useState(false);

  const challenge = game.challenge;
  const [pickedFor, setPickedFor] = useState<Challenge | null>(null);
  if (pickedFor !== challenge) {
    setPickedFor(challenge);
    setPicks([]);
  }

  const hear = async (beats: readonly string[], bpm: number) => {
    const ok = await player.playOnce(beatsPattern(beats), bpm);
    setSoundFailed(!ok);
  };
  const play = (c: Challenge) => void hear(heardBeats(c.prompt), c.prompt.bpm);

  const gaps = challenge?.prompt.gaps ?? [];
  const choose = (key: string) => {
    if (!challenge || game.done) return;
    const now = [...picks, key];
    if (now.length < gaps.length) {
      setPicks(now);
      return;
    }
    const outcome = game.answer(gapsGiven(now));
    setPicks(outcome === 'again' ? [] : now);
    if (outcome === 'right' || outcome === 'shown') void hear(challenge.prompt.beats, challenge.prompt.bpm);
  };

  const showGrid = Boolean(challenge && (challenge.prompt.grid || game.done));
  const cells = challenge ? gridCells(challenge.prompt, picks, game.index, game.done) : [];
  const nextGap = gaps.length > 1 ? Math.min(picks.length, gaps.length - 1) : 0;
  const answerText = challenge ? challenge.answer.split(' ').map((b) => writtenBeat(b, game.index)).join(', ') : '';

  return (
    <GameFrame game={game} title={t('playground.game.missing_beat.name')} instructions={t('playground.mb.instructions')} play={play} answerText={answerText}>
      {challenge ? (
        <>
          {soundFailed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
          <Button
            size="large"
            icon="listen"
            label={t('playground.round.hearAgain')}
            onPress={() => {
              game.replayed();
              play(challenge);
            }}
          />
          {showGrid ? (
            <View style={styles.grid}>
              {cells.map((cell, i) => {
                const gap = gaps.includes(i);
                return (
                  <View
                    key={i}
                    accessible
                    accessibilityLabel={gap && !game.done ? t('playground.mb.placeGap', { n: i + 1 }) : t('playground.mb.place', { n: i + 1, bol: cell })}
                    style={[
                      styles.cell,
                      {
                        borderColor: gap ? colors.primary : colors.cardBorder,
                        borderWidth: gap ? 3 : 1,
                        backgroundColor: colors.surface,
                        borderStyle: gap && !game.done ? 'dashed' : 'solid',
                      },
                    ]}
                  >
                    <AppText variant="small" tone="muted">
                      {i + 1}
                    </AppText>
                    <AppText variant="subtitle" family="sans">
                      {cell}
                    </AppText>
                  </View>
                );
              })}
            </View>
          ) : (
            <AppText tone="muted">{t('playground.mb.gridHidden')}</AppText>
          )}
          {game.done ? (
            <Button variant="secondary" icon="listen" label={t('playground.mb.hearWhole')} onPress={() => void hear(challenge.prompt.beats, challenge.prompt.bpm)} />
          ) : (
            <>
              <AppText variant="label">
                {gaps.length > 1 ? t('playground.mb.pickPlace', { n: gaps[nextGap] + 1 }) : t('playground.mb.pick')}
              </AppText>
              <View style={styles.choices}>
                {challenge.choices.map((choice) => (
                  <View key={choice.key} style={styles.choice}>
                    <Button size="large" variant="secondary" label={choiceText(choice, game.index)} onPress={() => choose(choice.key)} />
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      ) : null}
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: {
    minWidth: 64,
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { flexGrow: 1, flexBasis: '40%' },
});
