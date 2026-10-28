// Sound Explorer (the spec's "Instrument Explorer"; docs/RHYTHM_PLAYGROUND.md §7.9; docs/DECISIONS.md #760): hear a clip
// and tap the instrument — or, when several play together, every instrument heard, then Check. Recognition: saved
// and re-marked by the server as a set (0065 play_same_answer). Every card has the instrument's name in words (no
// colour or picture alone). After the answer each card can be heard alone (when the pack has a clip of it alone).
// Steps (template): one instrument of 3 → of 5 → two together. Uses the listening games' round (use-game-round.ts).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { Notice } from '@/components/notice';
import { ChoiceCards } from '@/components/playground/choice-cards';
import { playgroundAudioUrls } from '@/data/playground';
import { createClipPlayer } from '@/lib/playground/clip-player';
import { keyBeats } from '@/lib/playground/notation';
import type { Challenge, PlayAsset } from '@/lib/playground/types';

import { GameFrame } from './game-parts';
import { useGameRound } from './use-game-round';
import { clipSourceOf } from './voice-parts';

/** An instrument's name in the student's language; an unknown one as written. */
function useInstrumentName() {
  const { t, i18n } = useTranslation();
  return (key: string) => (i18n.exists(`playground.instrument.${key}`) ? t(`playground.instrument.${key}` as 'playground.instrument.kartal') : key.replace(/_/g, ' '));
}

export function SoundExplorer() {
  const { t } = useTranslation();
  const name = useInstrumentName();
  const game = useGameRound('sound_explorer');
  const [player] = useState(createClipPlayer);
  useEffect(() => () => player.dispose(), [player]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [chosenFor, setChosenFor] = useState<Challenge | null>(null);
  if (chosenFor !== game.challenge) {
    setChosenFor(game.challenge);
    setChosen([]);
  }

  const assets = useMemo(() => game.load?.pack?.assets ?? [], [game.load]);
  useEffect(() => {
    const paths = assets.filter((a) => a.kind === 'instrument' && a.path).map((a) => a.path as string);
    if (paths.length > 0) void playgroundAudioUrls(paths).then(setUrls).catch(() => undefined);
  }, [assets]);

  const playAsset = async (asset: PlayAsset | undefined) => {
    const source = clipSourceOf(asset, asset?.path ? (urls[asset.path] ?? null) : null);
    setFailed(!(source && (await player.play(source))));
  };
  const play = (c: Challenge) => void playAsset(assets.find((a) => a.id === c.prompt.assets[0]));
  const challenge = game.challenge;
  const together = challenge ? keyBeats(challenge.answer).length > 1 : false;
  const answerText = challenge ? keyBeats(challenge.answer).map(name).join(' + ') : '';

  const check = (keys: string[]) => {
    if (!challenge || game.done || keys.length === 0) return;
    const given = [...keys].sort().join(' ');
    const outcome = game.answer(given, [answerText, keys.map(name).join(' + ')]);
    if (outcome === 'again') setChosen([]);
    if (outcome === 'shown') play(challenge);
  };
  /** A card heard alone: a clip with only that instrument. */
  const alone = (key: string) => assets.find((a) => a.kind === 'instrument' && a.instruments.length === 1 && a.instruments[0] === key);

  return (
    <GameFrame
      game={game}
      title={t('playground.game.sound_explorer.name')}
      instructions={[t('playground.se.instructions')]}
      icon="instruments"
      play={play}
      answerText={answerText}
    >
      {challenge ? (
        <>
          {failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
          <Button size="large" icon="listen" label={t('playground.round.hearAgain')} onPress={() => { game.replayed(); play(challenge); }} />
          <AppText variant="label">{together ? t('playground.se.pickAll') : t('playground.se.pick')}</AppText>
          {together && !game.done ? (
            <>
              {challenge.choices.map((c) => (
                <Checkbox
                  key={c.key}
                  label={name(c.key)}
                  checked={chosen.includes(c.key)}
                  onChange={(on) => setChosen((list) => (on ? [...list, c.key] : list.filter((k) => k !== c.key)))}
                />
              ))}
              <Button icon="tick" label={t('playground.se.check')} onPress={() => check(chosen)} disabled={chosen.length === 0 || game.outcome === 'again'} />
            </>
          ) : (
            <ChoiceCards
              choices={challenge.choices.map((c) => ({ key: c.key, label: name(c.key) }))}
              onChoose={(key) => {
                if (game.done) return;
                setChosen([key]);
                check([key]);
              }}
              chosen={chosen.length === 1 ? chosen[0] : null}
              rightKey={game.done && !together ? challenge.answer : null}
              onHear={(key) => {
                const a = alone(key);
                if (a) void playAsset(a);
              }}
            />
          )}
        </>
      ) : null}
    </GameFrame>
  );
}
