// Rhythm Builder (docs/RHYTHM_PLAYGROUND.md §7.6; docs/DECISIONS.md #733): the student hears an approved pattern and
// builds it from bol tiles: tap a tile, then tap its place; tap a filled place to take the tile back. No dragging, so
// a keyboard and a screen reader can do it (each tile and place says what it holds). Rests are already in place;
// vibhag lines show while the step shows the grid. "Play mine" plays the tiles as placed; Check marks the places that
// sound different with "listen" and a button to hear that beat again. A tile that sounds the same counts as right.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer } from '@/lib/practice-audio';
import { answerKey, writtenBeat } from '@/lib/playground/notation';
import type { Challenge } from '@/lib/playground/types';
import {
  allPlaced,
  beatsPattern,
  choiceText,
  emptyPlaces,
  isFixed,
  placedBeats,
  placesToHearAgain,
  placeTile,
  rightPlaces,
  takeTile,
} from '@/lib/playground-games/listening';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { GameFrame } from './game-parts';
import { useGameRound } from './use-game-round';

/** The game. */
export function RhythmBuilder() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const game = useGameRound('rhythm_builder');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const [placed, setPlaced] = useState<(number | null)[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hearAgainAt, setHearAgainAt] = useState<number[]>([]);
  const [soundFailed, setSoundFailed] = useState(false);

  const challenge = game.challenge;
  const beats = challenge?.prompt.beats ?? [];
  const [placedFor, setPlacedFor] = useState<Challenge | null>(null);
  if (placedFor !== challenge) {
    setPlacedFor(challenge);
    setPlaced(emptyPlaces(beats));
    setChosen(null);
    setHearAgainAt([]);
  }

  const hear = async (list: readonly string[], bpm: number) => {
    const ok = await player.playOnce(beatsPattern(list), bpm);
    setSoundFailed(!ok);
  };
  const play = (c: Challenge) => void hear(c.prompt.beats, c.prompt.bpm);

  const tapPlace = (at: number) => {
    if (!challenge || game.done || isFixed(beats, at)) return;
    if (chosen !== null) {
      setPlaced(placeTile(beats, placed, chosen, at));
      setChosen(null);
    } else if (placed[at] !== null) {
      setPlaced(takeTile(placed, at));
    }
    setHearAgainAt((list) => list.filter((n) => n !== at));
  };

  const check = () => {
    if (!challenge) return;
    const mine = placedBeats(beats, challenge.choices, placed);
    const outcome = game.answer(answerKey(mine));
    if (outcome === 'again') setHearAgainAt(placesToHearAgain(beats, challenge.choices, placed, game.index));
    if (outcome === 'shown') {
      // The approved order is shown in the places, and played.
      setPlaced(rightPlaces(beats, challenge.choices, game.index));
      setHearAgainAt([]);
      play(challenge);
    }
  };

  const used = new Set(placed.filter((p): p is number => p !== null));
  // Vibhag starts while the grid is shown: a line before each.
  const starts = new Set<number>();
  if (challenge?.prompt.grid && challenge.prompt.divisions) {
    let n = 0;
    for (const d of challenge.prompt.divisions) {
      if (n > 0) starts.add(n);
      n += d;
    }
  }
  const answerText = challenge ? beats.map((b) => writtenBeat(b, game.index)).join(' ') : '';

  return (
    <GameFrame game={game} title={t('playground.game.rhythm_builder.name')} instructions={[t('playground.rb.instructions')]} icon="taal" play={play} answerText={answerText}>
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
          <AppText variant="label">{t('playground.rb.places')}</AppText>
          <View style={styles.row}>
            {beats.map((beat, i) => {
              const tile = placed[i];
              const text = isFixed(beats, i) ? '–' : tile !== null && tile !== undefined ? choiceText(challenge.choices[tile], game.index) : '';
              const said = isFixed(beats, i)
                ? t('playground.rb.placeRest', { n: i + 1 })
                : text
                  ? t('playground.rb.placeSaid', { n: i + 1, bol: text })
                  : t('playground.rb.placeEmpty', { n: i + 1 });
              const again = hearAgainAt.includes(i);
              return (
                <View key={i} style={[styles.placeWrap, starts.has(i) ? [styles.vibhag, { borderLeftColor: colors.text }] : null]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={said}
                    disabled={isFixed(beats, i) || game.done}
                    onPress={() => tapPlace(i)}
                    style={[
                      styles.place,
                      {
                        backgroundColor: isFixed(beats, i) ? colors.surfaceSunken : colors.surface,
                        borderColor: again ? colors.primary : chosen !== null ? colors.primary : colors.controlBorder,
                        borderWidth: again ? 3 : 1,
                        borderStyle: text ? 'solid' : 'dashed',
                      },
                    ]}
                  >
                    <AppText variant="small" tone="muted">
                      {i + 1}
                    </AppText>
                    <AppText variant="subtitle" family="sans">
                      {text}
                    </AppText>
                    {again ? <Icon name="listen" size={18} color={colors.primary} /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
          {hearAgainAt.map((at) => (
            <Button key={at} variant="secondary" icon="listen" label={t('playground.rb.hearPart', { n: at + 1 })} onPress={() => void hear([beats[at]], challenge.prompt.bpm)} />
          ))}
          {!game.done ? (
            <>
              <AppText variant="label">{t('playground.rb.tiles')}</AppText>
              {chosen !== null ? (
                <View accessible accessibilityLiveRegion="polite">
                  <AppText tone="muted">{t('playground.rb.chosen', { bol: choiceText(challenge.choices[chosen], game.index) })}</AppText>
                </View>
              ) : null}
              <View style={styles.row}>
                {challenge.choices.map((choice, tile) => {
                  const text = choiceText(choice, game.index);
                  const isUsed = used.has(tile);
                  const isChosen = chosen === tile;
                  return (
                    <Pressable
                      // The same bol twice is two tiles: told apart by their place in the list.
                      key={tile}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isChosen, disabled: isUsed }}
                      accessibilityLabel={isUsed ? t('playground.rb.tileUsed', { bol: text }) : t('playground.rb.tileSaid', { bol: text })}
                      disabled={isUsed}
                      onPress={() => setChosen(isChosen ? null : tile)}
                      style={[
                        styles.tile,
                        {
                          backgroundColor: isChosen ? colors.primary : colors.surface,
                          borderColor: isChosen ? colors.primary : colors.controlBorder,
                          opacity: isUsed ? 0.4 : 1,
                        },
                      ]}
                    >
                      <AppText variant="subtitle" family="sans" style={isChosen ? { color: colors.onPrimary } : undefined}>
                        {text}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  icon="play"
                  label={t('playground.rb.playMine')}
                  onPress={() => void hear(placedBeats(beats, challenge.choices, placed), challenge.prompt.bpm)}
                />
                <Button icon="check" label={t('playground.rb.check')} disabled={!allPlaced(beats, placed)} onPress={check} />
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  placeWrap: { paddingLeft: 0 },
  vibhag: { borderLeftWidth: 3, paddingLeft: spacing.xs },
  place: {
    minWidth: 64,
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    minWidth: 64,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
