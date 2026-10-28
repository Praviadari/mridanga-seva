// Sound Detective, the Playground's proof of concept (docs/RHYTHM_PLAYGROUND.md §7.1, §17; docs/DECISIONS.md #731). It
// is "Which bol?" (#471) grown up, at the same address (/student/which-bol): Rounds play the engine's seeded rounds of
// approved bols and phrases (2-4 cards) with two tries, and are saved for the student's progress; Free play is the
// old quiz on the level's taals (with the hand drawings), kept on the phone only. A card shows the bol as the class
// writes it and the hand that plays it; its sound is its label. After the answer every card can be heard.

import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { ChoiceCards } from '@/components/playground/choice-cards';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPracticePlayer } from '@/lib/practice-audio';
import { keyBeats, type BolIndex } from '@/lib/playground/notation';
import type { Challenge, Choice } from '@/lib/playground/types';
import { beatsPattern, choiceHands, choicePattern, choiceText } from '@/lib/playground-games/listening';

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
  const [picked, setPicked] = useState<string | null>(null);
  const [soundFailed, setSoundFailed] = useState(false);

  const challenge = game.challenge;
  // A new challenge: no pick yet.
  const [pickedFor, setPickedFor] = useState<Challenge | null>(null);
  if (pickedFor !== challenge) {
    setPickedFor(challenge);
    setPicked(null);
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

  const answerText = challenge ? choiceText({ key: challenge.answer, beats: [] }, game.index) : '';
  const choose = (key: string) => {
    if (!challenge || game.done || key === picked) return;
    const choice = challenge.choices.find((c) => c.key === key);
    if (!choice) return;
    setPicked(key);
    const outcome = game.answer(key, [answerText, choiceText(choice, game.index)]);
    // After the last try the answer is shown and played.
    if (outcome === 'shown') play(challenge);
  };
  const hearCard = (key: string) => {
    const choice = challenge?.choices.find((c) => c.key === key);
    if (choice && challenge) void player.playOnce(choicePattern(choice), challenge.prompt.bpm).then((ok) => setSoundFailed(!ok));
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
      answerText={answerText}
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
          <ChoiceCards
            choices={challenge.choices.map((choice) => ({
              key: choice.key,
              label: choiceText(choice, game.index),
              sublabel: handsWords(t, choice, game.index),
            }))}
            onChoose={choose}
            chosen={picked}
            rightKey={game.done ? challenge.answer : null}
            onHear={hearCard}
          />
        </>
      ) : null}
    </GameFrame>
  );
}

/** The words for a card's hands: one for a bol, one per bol of a phrase. */
function handsWords(t: TFunction, choice: Choice, index: BolIndex): string {
  const hands = choiceHands(choice, index);
  if (hands) return t(`playground.sd.hands.${hands}`);
  return keyBeats(choice.key)
    .map((beat) => {
      const h = choiceHands({ key: beat, beats: [beat] }, index);
      return h ? t(`playground.sd.hands.${h}`) : '';
    })
    .filter(Boolean)
    .join(' · ');
}
