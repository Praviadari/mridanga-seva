// Vocal Sādhana Studio (docs/RHYTHM_PLAYGROUND.md §7.13; docs/DECISIONS.md #763): music practice for the voice, not
// voice therapy. Each challenge is one of five activities, told by its exercise's skill: Pitch Match (a note or a
// phrase), Steady Note (hold a note for the seconds chosen — duration only, never loudness), Bol Pronunciation (hear a
// bol, say it — padhant), Rhythmic Chanting (recite the bols on the pulse) and Call & Response (hear the call, answer
// it). Every activity ends with the student's own check; the microphone is optional (record, compare, delete, send to
// the facilitator, who rates it 0-3). No automatic pronunciation or voice grade (spec §22, §28). Always "comfortable,
// gentle, stop any time".

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { createPracticePlayer } from '@/lib/practice-audio';
import { bolIndex, keyBeats } from '@/lib/playground/notation';
import { createClipPlayer, stopAllClips } from '@/lib/playground/clip-player';
import { noteHz } from '@/lib/playground/tones';
import type { Challenge, PlayExercise } from '@/lib/playground/types';
import { beatsPattern, choiceText } from '@/lib/playground-games/listening';

import { usePracticeRound } from './use-practice-round';
import { referenceSource, toneNotes, useVoiceChoices, VoiceChoices } from './voice-companion';
import { clipSourceOf, MicTake, PitchLinePanel, PracticeFrame, SelfCheck } from './voice-parts';

export type Activity = 'pitch' | 'steady' | 'bol' | 'chant' | 'call';

/** Which activity an exercise is (its first voice skill; bol recitation of 3+ beats is chanting on the pulse). */
export function activityOf(ex: Pick<PlayExercise, 'skills' | 'sequence'> | null | undefined): Activity {
  const skill = ex?.skills.find((s) => s.startsWith('vocal.')) ?? 'vocal.pitch';
  if (skill === 'vocal.steady') return 'steady';
  if (skill === 'vocal.call_response') return 'call';
  if (skill === 'vocal.bol_recite') return (ex?.sequence?.filter((b) => b !== '-').length ?? 0) >= 3 ? 'chant' : 'bol';
  return 'pitch';
}

export function VocalStudio() {
  const { t } = useTranslation();
  const game = usePracticeRound('vocal_studio');
  const choices = useVoiceChoices();
  const [clips] = useState(createClipPlayer);
  const [strokes] = useState(createPracticePlayer);
  useEffect(
    () => () => {
      clips.dispose();
      strokes.dispose();
    },
    [clips, strokes],
  );
  const [failed, setFailed] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const exerciseOf = (c: Challenge | null) => game.load?.pack?.exercises.find((e) => e.id === c?.exerciseId) ?? null;
  const activity = activityOf(exerciseOf(game.challenge));
  const index = bolIndex(game.load?.pack?.bols ?? []);
  const found = game.assetOf(game.challenge);
  const notes = toneNotes(game.challenge, found?.asset.bundledKey);

  const stopAll = () => {
    stopAllClips();
    strokes.stop();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setHeld(null);
  };

  const hear = async (c: Challenge | null = game.challenge) => {
    if (!c) return;
    stopAll();
    const a = activityOf(exerciseOf(c));
    if ((a === 'bol' || a === 'chant') && c.prompt.beats.length > 0) {
      setFailed(!(await strokes.playOnce(beatsPattern(c.prompt.beats), c.prompt.bpm)));
      return;
    }
    const f = game.assetOf(c);
    const n = toneNotes(c, f?.asset.bundledKey);
    const noteMs = a === 'steady' ? choices.hold * 1000 : n && n.length > 1 ? 1000 : 2000;
    const source = n ? referenceSource(n, choices.tonicHz, noteMs, choices.drone) : clipSourceOf(f?.asset, f?.url ?? null);
    setFailed(!(source && (await clips.play(source))));
  };

  const startHold = () => {
    stopAll();
    const began = Date.now();
    setHeld(0);
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setHeld(s);
      if (s >= choices.hold && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 200);
  };

  const answer = game.items[game.at]?.a ?? null;
  const written = game.challenge ? keyBeats(game.challenge.answer).map((b) => choiceText({ key: b, beats: [b] }, index)).join(' ') : '';

  return (
    <PracticeFrame
      game={game}
      title={t('playground.game.vocal_studio.name')}
      instructions={[t('playground.vs.instructions'), t('playground.voice.health')]}
      icon="performer"
      onShow={(c) => void hear(c)}
      onStop={stopAll}
      top={<VoiceChoices choices={choices} showHold />}
      summary={<AppText>{t('playground.vs.summary', { n: game.items.length })}</AppText>}
    >
      <AppText variant="subtitle">{t(`playground.vs.activity.${activity}`)}</AppText>
      <AppText tone="muted">{t(`playground.vs.help.${activity}`, { seconds: choices.hold })}</AppText>
      {(activity === 'bol' || activity === 'chant') && written ? <AppText variant="subtitle">{written}</AppText> : null}
      {failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      <Button size="large" icon="listen" label={t(`playground.vs.listen.${activity}`)} onPress={() => { game.replayed(); void hear(); }} />
      {activity === 'steady' ? (
        <>
          <Button variant="secondary" icon="time" label={t('playground.vs.holdStart', { seconds: choices.hold })} onPress={startHold} />
          {held !== null ? (
            <AppText variant="subtitle" accessibilityLiveRegion="polite">
              {held >= choices.hold ? t('playground.vs.holdDone') : t('playground.vs.holdCount', { n: held, of: choices.hold })}
            </AppText>
          ) : null}
        </>
      ) : null}
      <AppText variant="small" tone="muted">{t('playground.voice.health')}</AppText>
      <SelfCheck question={t(`playground.vs.check.${activity}`)} value={answer} onAnswer={(a) => game.mark({ a })} />
      <MicTake game="vocal_studio" onHearReference={() => void hear()} />
      {activity === 'pitch' && notes ? <PitchLinePanel targetHz={noteHz(choices.tonicHz, notes[0])} /> : null}
    </PracticeFrame>
  );
}
