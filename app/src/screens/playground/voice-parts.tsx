// Parts the voice and kīrtan games share (docs/RHYTHM_PLAYGROUND.md §7.5, §7.13, §7.14, §10.4, §13.2; docs/DECISIONS.md
// #763-#766): the round frame for games where the student says when a challenge is done; the self-check; the
// optional microphone (off until the student turns it on; a take stays on the phone, can be played beside the
// reference, deleted, or sent to the facilitator — only through "Send to my facilitator", only when the facilitator
// has an assessment open for this game, at most 2 waiting, at most 90 seconds); and the TEST pitch line (browser
// only, approximate, never a grade).

import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AudioRecorderPanel, durationText, PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon, type IconName } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { GameShell } from '@/components/playground/game-shell';
import { InstructionsPreview } from '@/components/playground/instructions-preview';
import { fetchPlaySendInfo, openSendScreen, PLAY_OPEN_TAKES_MAX, PLAY_TAKE_MAX_SECONDS, type PlaySendInfo } from '@/data/playground-takes';
import { formatDate } from '@/lib/dates';
import { pitchLineAvailable, startPitchLine, type PitchLine } from '@/lib/pitch';
import { pitchWord, steadyPitch, type PitchEstimate, type PitchWord } from '@/lib/pitch-estimate';
import type { ClipSource } from '@/lib/playground/clip-player';
import { renderSynth, type SynthOptions } from '@/lib/playground/tones';
import type { Challenge, GameId, PlayAsset } from '@/lib/playground/types';
import type { RecordedTake } from '@/lib/recording';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { leaveGame } from './game-parts';
import type { PracticeRound } from './use-practice-round';

/** A challenge's sound for the clip player: the recorded file (signed link), or the generated TEST sound. */
export function clipSourceOf(asset: PlayAsset | null | undefined, url: string | null, opts: SynthOptions = {}): ClipSource | null {
  if (!asset) return null;
  if (asset.path) return url ? { uri: url } : null;
  const key = asset.bundledKey;
  if (!key?.startsWith('synth:')) return null;
  return { key: `${key}|${opts.tonicHz ?? ''}|${opts.noteMs ?? ''}|${opts.clipMs ?? ''}`, render: () => renderSynth(key, opts)?.samples ?? new Float32Array(1) };
}

/** Props for PracticeFrame. */
export type PracticeFrameProps = {
  game: PracticeRound;
  title: string;
  instructions: readonly string[];
  icon: IconName;
  /** Called when a challenge comes up after a tap (Start or Next) — never on opening. */
  onShow?: (challenge: Challenge) => void;
  /** Stops any sound (leaving a challenge). */
  onStop?: () => void;
  /** Above the round (a choice the game needs before Start, e.g. the voice range). */
  top?: ReactNode;
  children: ReactNode;
  /** The summary's lines (what was practised). */
  summary?: ReactNode;
};

/** The frame of a voice or kīrtan round: Start, one challenge at a time, Next when the student is done, a summary. */
export function PracticeFrame({ game, title, instructions, icon, onShow, onStop, top, children, summary }: PracticeFrameProps) {
  const { t } = useTranslation();
  const { phase, round, at, challenge } = game;

  const begin = (step?: number) => {
    const made = game.start(step);
    if (made && made.challenges[0]) onShow?.(made.challenges[0]);
  };
  const next = () => {
    onStop?.();
    const following = round && !game.last ? round.challenges[at + 1] : null;
    game.next();
    if (following) onShow?.(following);
  };
  const exit = () => {
    onStop?.();
    leaveGame();
  };

  const playing = phase === 'playing' && round ? round : null;
  return (
    <>
      <Stack.Screen options={{ title, headerShown: false }} />
      <GameShell
        title={title}
        onExit={exit}
        progress={playing ? { current: at, total: playing.challenges.length, done: game.items.map((i) => i.ok ?? null) } : undefined}
        testSounds={game.testSounds}
        lowContent={Boolean(playing?.lowContent)}
        review={Boolean(playing && challenge?.review)}
      >
        {phase === 'loading' ? (
          <>
            <AppText tone="muted">{t('playground.round.loading')}</AppText>
            <LoadingCards />
          </>
        ) : null}
        {phase === 'off' ? <Notice tone="info">{t('playground.round.notReady')}</Notice> : null}
        {phase === 'empty' ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
        {game.load?.offline && phase !== 'loading' ? <Notice tone="info">{t('playground.round.offline')}</Notice> : null}
        {phase === 'ready' ? (
          <>
            {top}
            {game.steps.length > 1 ? (
              <ChoiceGroup<number>
                segmented
                label={t('playground.round.step')}
                value={game.step}
                onChange={game.setStep}
                choices={game.steps.map((n) => ({ value: n, label: t('playground.round.stepChoice', { n }) }))}
              />
            ) : null}
            <InstructionsPreview lines={instructions} icon={icon} step={game.step} startLabel={t('playground.round.start')} onStart={() => begin()} />
          </>
        ) : null}
        {playing ? (
          <>
            {playing.challenges.length === 0 ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
            {challenge ? (
              <>
                {children}
                <Button
                  size="large"
                  icon={game.last ? 'tick' : 'chevron'}
                  label={game.last ? t('playground.practice.finish') : t('playground.practice.next')}
                  onPress={next}
                  disabled={!game.marked}
                />
                {!game.marked ? (
                  <AppText variant="small" tone="muted">
                    {t('playground.practice.nextHint')}
                  </AppText>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        {phase === 'summary' ? (
          <View style={styles.column}>
            <AppText variant="subtitle">{t('playground.practice.summaryTitle')}</AppText>
            {summary}
            <AppText tone="muted">{t('playground.practice.kholLine')}</AppText>
            <Button icon="refresh" label={t('playground.practice.again')} onPress={() => begin(game.step)} />
            <Button variant="secondary" icon="back" label={t('playground.practice.back')} onPress={exit} />
          </View>
        ) : null}
      </GameShell>
    </>
  );
}

/** "Did you match it?" Yes / Not sure — the student's own check, saved as practice, never as right or wrong. */
export function SelfCheck({ question, value, onAnswer }: { question: string; value: string | null; onAnswer: (answer: 'yes' | 'not_sure') => void }) {
  const { t } = useTranslation();
  return (
    <ChoiceGroup<'yes' | 'not_sure'>
      segmented
      label={question}
      value={value === 'yes' || value === 'not_sure' ? value : null}
      onChange={onAnswer}
      choices={[
        { value: 'yes', label: t('playground.practice.yes') },
        { value: 'not_sure', label: t('playground.practice.notSure') },
      ]}
    />
  );
}

/**
 * The optional microphone: off until turned on here. A take is kept only while this screen is open, can be played
 * (and the reference heard again with `onHearReference`), deleted, or sent to the facilitator.
 */
export function MicTake({ game, onHearReference, hint }: { game: GameId; onHearReference?: () => void; hint?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [on, setOn] = useState(false);
  const [take, setTake] = useState<RecordedTake | null>(null);
  if (!on) {
    return (
      <View style={[styles.box, { borderColor: colors.border }]}>
        <AppText variant="small" tone="muted">
          {t('playground.mic.offIntro')}
        </AppText>
        <Button variant="secondary" icon="record" label={t('playground.mic.turnOn')} onPress={() => setOn(true)} />
      </View>
    );
  }
  return (
    <View style={[styles.box, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <Icon name="record" size={18} color={colors.text} />
        <AppText variant="label">{t('playground.mic.title')}</AppText>
      </View>
      <AppText variant="small" tone="muted">
        {hint ?? t('playground.mic.privacy', { seconds: PLAY_TAKE_MAX_SECONDS })}
      </AppText>
      <AudioRecorderPanel mode="auto" maxSeconds={PLAY_TAKE_MAX_SECONDS} onTake={setTake} />
      {take ? (
        <>
          <AppText variant="small">{t('playground.mic.takeLength', { time: durationText(take.durationMs) })}</AppText>
          <View style={styles.wrap}>
            {onHearReference ? <Button variant="secondary" icon="listen" label={t('playground.mic.hearReference')} onPress={onHearReference} /> : null}
            <PlayButton uri={take.uri} label={t('playground.mic.playMine')} />
            <Button variant="link" icon="delete" label={t('playground.mic.delete')} onPress={() => setTake(null)} />
          </View>
          <SendTake game={game} take={take} />
        </>
      ) : null}
      <Button variant="link" label={t('playground.mic.turnOff')} onPress={() => { setTake(null); setOn(false); }} />
    </View>
  );
}

/** "Send to my facilitator": only when an assessment for this game is open, and fewer than 2 takes wait. */
export function SendTake({ game, take }: { game: GameId; take: RecordedTake }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<PlaySendInfo | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchPlaySendInfo(game).then((found) => live && setInfo(found));
    return () => {
      live = false;
    };
  }, [game]);
  if (info === undefined || info === null || info.targets.length === 0) return null;
  if (info.waiting >= PLAY_OPEN_TAKES_MAX) return <AppText variant="small" tone="muted">{t('playground.mic.takesFull', { max: PLAY_OPEN_TAKES_MAX })}</AppText>;
  return (
    <View style={styles.column}>
      {info.targets.map((target) => (
        <Button
          key={target.assignmentId}
          icon="send"
          label={info.targets.length > 1 ? t('playground.mic.sendTo', { title: target.title, date: target.dueOn ? formatDate(target.dueOn) : '' }) : t('playground.mic.send')}
          onPress={() => void openSendScreen(take, target.assignmentId).then((ok) => setFailed(!ok))}
        />
      ))}
      {failed ? <Notice tone="error">{t('recordMyself.keepFailed')}</Notice> : null}
    </View>
  );
}

/** The TEST pitch line (browser on a TEST build only): "higher / lower / close", approximate, never stored as a grade. */
export function PitchLinePanel({ targetHz }: { targetHz: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [on, setOn] = useState(false);
  const [word, setWord] = useState<PitchWord | 'quiet' | 'unclear' | null>(null);
  const [refused, setRefused] = useState(false);
  const line = useRef<PitchLine | null>(null);
  const recent = useRef<PitchEstimate[]>([]);
  const target = useRef(targetHz);
  useEffect(() => {
    target.current = targetHz;
  }, [targetHz]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    recent.current = [];
    void startPitchLine(({ estimate, level }) => {
      if (level < 0.01) {
        setWord('quiet');
        return;
      }
      if (estimate) recent.current = [...recent.current.slice(-6), estimate];
      const hz = steadyPitch(recent.current);
      setWord(hz === null ? 'unclear' : pitchWord(hz, target.current));
    }).then((started) => {
      if (!live) started?.stop();
      else if (!started) {
        setRefused(true);
        setOn(false);
      } else line.current = started;
    });
    return () => {
      live = false;
      line.current?.stop();
      line.current = null;
    };
  }, [on]);

  if (!pitchLineAvailable()) return null;
  return (
    <View style={[styles.box, { borderColor: colors.accent }]}>
      <AppText variant="label">{t('playground.pitch.title')}</AppText>
      <AppText variant="small" tone="muted">
        {t('playground.pitch.intro')}
      </AppText>
      {on ? (
        <>
          <View style={styles.row} accessibilityLiveRegion="polite">
            <Icon name="record" size={18} color={colors.text} />
            <AppText variant="small">{t('playground.pitch.listening')}</AppText>
          </View>
          <AppText variant="subtitle">{word ? t(`playground.pitch.word.${word}`) : '…'}</AppText>
          <Button variant="secondary" label={t('playground.pitch.stop')} onPress={() => setOn(false)} />
        </>
      ) : (
        <Button variant="secondary" icon="record" label={t('playground.pitch.start')} onPress={() => { setRefused(false); setOn(true); }} />
      )}
      {refused ? <Notice tone="info">{t('playground.pitch.refused')}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius, padding: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  column: { gap: spacing.sm },
});
