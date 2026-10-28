// Voice Companion (docs/RHYTHM_PLAYGROUND.md §7.5; docs/DECISIONS.md #763): hear a reference note on "aa" (made from the
// tonic of the voice range the student picks — no recording needed), sing it softly, hear it again, and say whether
// it matched ("Yes" / "Not sure"; saved as practice, never as right or wrong). Steps: one note → a note held 3, 5 or
// 8 seconds (the student chooses) → a two-note step → a short phrase; a soft drone can play under the note. The
// microphone is optional and off: record, play yours beside the note, delete, or send to the facilitator. On a TEST
// browser build an approximate pitch line can be turned on. Feedback never mentions loudness, height or "good voice".

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { createClipPlayer } from '@/lib/playground/clip-player';
import { noteHz, normalise, parseSynthKey, RANGE_TONIC_HZ, renderDrone, TONE_RATE, renderPhrase, VOICE_RANGES, type VoiceRange } from '@/lib/playground/tones';
import type { Challenge } from '@/lib/playground/types';

import { usePracticeRound } from './use-practice-round';
import { clipSourceOf, MicTake, PitchLinePanel, PracticeFrame, SelfCheck } from './voice-parts';

const HOLDS = [3, 5, 8] as const;

/** The voice range, the hold and the drone, shared with Vocal Sādhana Studio. */
export function useVoiceChoices() {
  const [range, setRange] = useState<VoiceRange>('higher');
  const [hold, setHold] = useState<(typeof HOLDS)[number]>(3);
  const [drone, setDrone] = useState(false);
  return { range, setRange, hold, setHold, drone, setDrone, tonicHz: RANGE_TONIC_HZ[range] };
}

/** The range, hold and drone choices. */
export function VoiceChoices({ choices, showHold }: { choices: ReturnType<typeof useVoiceChoices>; showHold: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <ChoiceGroup<VoiceRange>
        segmented
        label={t('playground.voice.range')}
        value={choices.range}
        onChange={choices.setRange}
        choices={VOICE_RANGES.map((r) => ({ value: r, label: t(`playground.voice.ranges.${r}`) }))}
      />
      {showHold ? (
        <ChoiceGroup<number>
          segmented
          label={t('playground.voice.hold')}
          value={choices.hold}
          onChange={(n) => choices.setHold(n as (typeof HOLDS)[number])}
          choices={HOLDS.map((n) => ({ value: n, label: t('playground.voice.seconds', { n }) }))}
        />
      ) : null}
      <Checkbox label={t('playground.voice.drone')} checked={choices.drone} onChange={choices.setDrone} />
    </>
  );
}

/** The notes of a tone challenge (semitones above Sa), or null when its sound is a recording. */
export function toneNotes(challenge: Challenge | null, bundledKey: string | null | undefined): number[] | null {
  if (!challenge) return null;
  const spec = parseSynthKey(bundledKey);
  return spec?.kind === 'tone' ? spec.semitones : null;
}

/** Plays the reference: the notes at the tonic, each `noteMs` long, with the drone under them when chosen. */
export function referenceSource(notes: number[], tonicHz: number, noteMs: number, drone: boolean) {
  return {
    key: `voice|${notes.join(',')}|${tonicHz}|${noteMs}|${drone ? 1 : 0}`,
    render: () => {
      const line = renderPhrase(tonicHz, notes, noteMs);
      if (!drone) return line;
      const under = renderDrone(tonicHz, (line.length / TONE_RATE) * 1000 + 600);
      const out = new Float32Array(Math.max(line.length, under.length));
      for (let i = 0; i < out.length; i++) out[i] = (line[i] ?? 0) + 0.6 * (under[i] ?? 0);
      return normalise(out, 0.7);
    },
  };
}

export function VoiceCompanion() {
  const { t } = useTranslation();
  const game = usePracticeRound('voice_companion');
  const choices = useVoiceChoices();
  const [player] = useState(createClipPlayer);
  useEffect(() => () => player.dispose(), [player]);
  const [failed, setFailed] = useState(false);

  const found = game.assetOf(game.challenge);
  const notes = toneNotes(game.challenge, found?.asset.bundledKey);
  // One note held: the chosen hold from step 2; a step or phrase: 1.2 s a note.
  const noteMs = notes && notes.length > 1 ? 1200 : game.step >= 2 ? choices.hold * 1000 : 2000;
  const hear = async (c: Challenge | null = game.challenge) => {
    const f = game.assetOf(c);
    const n = toneNotes(c, f?.asset.bundledKey);
    const source = n ? referenceSource(n, choices.tonicHz, n.length > 1 ? 1200 : game.step >= 2 ? choices.hold * 1000 : 2000, choices.drone) : clipSourceOf(f?.asset, f?.url ?? null);
    setFailed(!(source && (await player.play(source))));
  };
  const answer = game.items[game.at]?.a ?? null;
  const yes = game.items.filter((i) => i.a === 'yes').length;

  return (
    <PracticeFrame
      game={game}
      title={t('playground.game.voice_companion.name')}
      instructions={[t('playground.vc.instructions'), t('playground.voice.health')]}
      icon="record"
      onShow={(c) => void hear(c)}
      onStop={() => player.stop()}
      top={<VoiceChoices choices={choices} showHold={game.step >= 2} />}
      summary={<AppText>{t('playground.vc.summary', { n: game.items.length, yes })}</AppText>}
    >
      <AppText variant="label">{notes && notes.length > 1 ? t('playground.vc.phrase', { n: notes.length }) : t('playground.vc.oneNote', { seconds: noteMs / 1000 })}</AppText>
      {failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      <Button size="large" icon="listen" label={t('playground.vc.listen')} onPress={() => { game.replayed(); void hear(); }} />
      <AppText tone="muted">{t('playground.vc.sing')}</AppText>
      <AppText variant="small" tone="muted">{t('playground.voice.health')}</AppText>
      <SelfCheck question={t('playground.vc.matched')} value={answer} onAnswer={(a) => game.mark({ a })} />
      {answer === 'not_sure' ? <AppText tone="muted">{t('playground.vc.listenAgain')}</AppText> : null}
      <MicTake game="voice_companion" onHearReference={() => void hear()} />
      {notes ? <PitchLinePanel targetHz={noteHz(choices.tonicHz, notes[0])} /> : null}
    </PracticeFrame>
  );
}
