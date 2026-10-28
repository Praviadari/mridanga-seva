// Sound Detective, the Playground's proof of concept (docs/RHYTHM_PLAYGROUND.md §7.1, §17; docs/DECISIONS.md #731). It
// is "Which bol?" (#471) grown up, at the same address (/student/which-bol): Rounds play the engine's seeded rounds of
// approved bols and phrases (2-4 cards, close pairs, phrases from step 5) with two tries a card, and are saved for the
// student's progress; Free play is the old quiz on the level's taals, kept on the phone only. A card shows the bol as
// the class writes it and the hands that play it; its sound is its label. After the answer every card can be heard.

import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { HandDrawing } from '@/components/hand-view';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { readBol } from '@/lib/bols';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer } from '@/lib/practice-audio';
import { keyBeats, type BolIndex } from '@/lib/playground/notation';
import type { Challenge, Choice } from '@/lib/playground/types';
import { beatsPattern, choiceHands, choicePattern, choiceText } from '@/lib/playground-games/listening';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { WhichBolQuiz } from '../which-bol';
import { GameFrame } from './game-parts';
import { useGameRound } from './use-game-round';

type Mode = 'rounds' | 'free';

/** The game. */
export function SoundDetective() {
  const { t } = useTranslation();
  const game = useGameRound('sound_detective');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const [mode, setMode] = useState<Mode>('rounds');
  const [picked, setPicked] = useState<string[]>([]);
  const [soundFailed, setSoundFailed] = useState(false);

  const challenge = game.challenge;
  // A new challenge: no picks yet.
  const [pickedFor, setPickedFor] = useState<Challenge | null>(null);
  if (pickedFor !== challenge) {
    setPickedFor(challenge);
    setPicked([]);
  }

  const hearBeats = async (beats: readonly string[], bpm: number) => {
    const ok = await player.playOnce(beatsPattern(beats), bpm);
    setSoundFailed(!ok);
  };
  const play = (c: Challenge) => void hearBeats(c.prompt.beats, c.prompt.bpm);
  const hearAgain = () => {
    if (!challenge) return;
    game.replayed();
    play(challenge);
  };

  const choose = (choice: Choice) => {
    if (!challenge) return;
    if (game.done) {
      // After the answer a card is heard, to compare.
      void player.playOnce(choicePattern(choice), challenge.prompt.bpm).then((ok) => setSoundFailed(!ok));
      return;
    }
    if (picked.includes(choice.key)) return;
    setPicked((p) => [...p, choice.key]);
    const outcome = game.answer(choice.key, [choiceText({ key: challenge.answer, beats: [] }, game.index), choiceText(choice, game.index)]);
    if (outcome === 'shown') {
      // After the last try the answer is shown and played.
      play(challenge);
    }
  };

  const top =
    game.phase === 'playing' ? null : (
      <ChoiceGroup<Mode>
        segmented
        label={t('playground.game.sound_detective.name')}
        value={mode}
        onChange={(m) => {
          player.stop();
          setMode(m);
        }}
        choices={[
          { value: 'rounds', label: t('playground.sd.rounds') },
          { value: 'free', label: t('playground.sd.freePlay') },
        ]}
      />
    );

  return (
    <GameFrame
      game={game}
      title={t('playground.game.sound_detective.name')}
      instructions={[t('playground.sd.instructions')]}
      icon="listen"
      play={play}
      answerText={challenge ? choiceText({ key: challenge.answer, beats: [] }, game.index) : ''}
      top={top}
      replace={
        mode === 'free' ? (
          <>
            <AppText tone="muted">{t('playground.sd.freePlayHint')}</AppText>
            <WhichBolQuiz />
          </>
        ) : undefined
      }
    >
      {challenge ? (
        <>
          {soundFailed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
          <Button size="large" icon="listen" label={t('playground.round.hearAgain')} onPress={hearAgain} />
          <AppText variant="label">{game.done ? t('playground.sd.compare') : t('playground.sd.pick')}</AppText>
          <View style={styles.cards}>
            {challenge.choices.map((choice) => {
              const isAnswer = choice.key === challenge.answer;
              const state: CardState = !game.done
                ? picked.includes(choice.key)
                  ? 'mine'
                  : 'open'
                : isAnswer
                  ? 'answer'
                  : picked.includes(choice.key)
                    ? 'mine'
                    : 'other';
              return <DetectiveCard key={choice.key} choice={choice} index={game.index} state={state} onPress={() => choose(choice)} />;
            })}
          </View>
        </>
      ) : null}
    </GameFrame>
  );
}

type CardState = 'open' | 'answer' | 'mine' | 'other';

/** The words for a card's hands, for the screen reader and under a phrase. */
function handsWords(t: TFunction, choice: Choice, index: BolIndex): string {
  const hands = choiceHands(choice, index);
  if (hands) return t(`playground.sd.hands.${hands}`);
  return keyBeats(choice.key)
    .map((beat) => {
      const h = choiceHands({ key: beat, beats: [beat] }, index);
      return h ? t(`playground.sd.hands.${h}`) : '';
    })
    .filter(Boolean)
    .join(', ');
}

/** One card: the bols in large type and, for a single bol, the hands that play it. */
function DetectiveCard({ choice, index, state, onPress }: { choice: Choice; index: BolIndex; state: CardState; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const text = choiceText(choice, index);
  const said = t('playground.sd.cardSaid', { bols: text, hands: handsWords(t, choice, index) });
  const beats = keyBeats(choice.key);
  const single = beats.length === 1 && !beats[0].includes('.') ? readBol(beats[0]) : null;
  const border = state === 'answer' ? colors.success : state === 'mine' ? colors.primary : colors.cardBorder;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        state === 'answer' ? t('playground.sd.cardRight', { bols: said }) : state === 'mine' ? t('playground.sd.cardMine', { bols: said }) : said
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surfaceSunken : colors.surface, borderColor: border, borderWidth: state === 'answer' || state === 'mine' ? 3 : 1 },
      ]}
    >
      <View style={styles.cardText}>
        <AppText variant="title" family="sans">
          {text}
        </AppText>
        <AppText variant="small" tone="muted">
          {handsWords(t, choice, index)}
        </AppText>
        {state === 'answer' ? (
          <View style={styles.mark}>
            <Icon name="tick" size={18} color={colors.success} />
            <AppText variant="label" tone="success">
              {t('playground.sd.thisOne')}
            </AppText>
          </View>
        ) : null}
        {state === 'mine' ? (
          <View style={styles.mark}>
            <Icon name="person" size={18} color={colors.primary} />
            <AppText variant="label" tone="primary">
              {t('playground.sd.yourPick')}
            </AppText>
          </View>
        ) : null}
      </View>
      {single && !single.unknown ? (
        <View style={styles.hands} aria-hidden>
          <View style={styles.hand}>
            <HandDrawing side="left" stroke={single.strokes.find((s) => s.head === 'baya') ?? null} fresh />
          </View>
          <View style={styles.hand}>
            <HandDrawing side="right" stroke={single.strokes.find((s) => s.head === 'dayan') ?? null} fresh />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cards: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radius,
  },
  cardText: { flex: 1, gap: 2 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hands: { flexDirection: 'row', gap: spacing.xs },
  hand: { width: 60, height: 60 },
});
