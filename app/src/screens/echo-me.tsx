// Echo me, call and response (docs/DECISIONS.md #472; research idea 4): the class's own way of teaching, the Guru
// plays and the student plays it back. The app plays one vibhag of a taal (the call), then leaves as long silent for
// the answer (soft clicks on its beats when wished), then the next vibhag, or the same one again (lib/echo.ts). The
// student answers on the drum or on the tap pads; pad answers are graded like the play-along and get stars per round,
// the best kept on this phone. With Record myself (components/record-myself.tsx) the drum answers are recorded with
// the calls and heard back against them; the takes stay on the phone (#283). Routes: student/echo-me.tsx,
// staff/echo-me.tsx.

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { CycleStars, TaalChips, TapPads, TempoStepper, TuneLine } from '@/components/play-parts';
import { RecordMyself } from '@/components/record-myself';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchTaals, type Taal, type TaalList } from '@/data/practice';
import type { SoundId } from '@/lib/bols';
import { echoPlace, echoPlan } from '@/lib/echo';
import { applySoundChoice } from '@/lib/khol-samples';
import type { RecordingSetting } from '@/lib/my-recordings';
import { createPadSound } from '@/lib/pad-sound';
import { createPracticePlayer } from '@/lib/practice-audio';
import { countInClicks } from '@/lib/practice-pattern';
import type { PadHand } from '@/lib/tap-grading';
import { usePlayhead } from '@/lib/use-playhead';
import { useTapGame } from '@/lib/use-tap-game';
import { radius, spacing, useTheme } from '@/theme/use-theme';

type AnswerOn = 'drum' | 'pads';

/** The pad's sound for a tap near no stroke of the answer. */
const PLAIN_TAP: Record<PadHand, SoundId> = { left: 'ga', right: 'ta' };

/** Echo me. */
export function EchoMe() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [player] = useState(createPracticePlayer);
  const [padSound] = useState(createPadSound);
  useEffect(
    () => () => {
      player.dispose();
      padSound.dispose();
    },
    [player, padSound],
  );
  useEffect(() => {
    void applySoundChoice();
  }, []);

  const [list, setList] = useState<TaalList | undefined>(undefined);
  const [taalId, setTaalId] = useState<number | null>(null);
  const [bpm, setBpm] = useState(60);
  const [vibhag, setVibhag] = useState<number | null>(null);
  const [clicks, setClicks] = useState(true);
  const [showBols, setShowBols] = useState(true);
  const [answerOn, setAnswerOn] = useState<AnswerOn>('drum');
  const [playing, setPlaying] = useState(false);
  const [starts, setStarts] = useState(0);
  const [soundFailed, setSoundFailed] = useState(false);
  const [tuning, setTuning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void fetchTaals().then((loaded) => {
        const usable = { ...loaded, taals: loaded.taals.filter((tl) => tl.active) };
        setList(usable);
        setTaalId((current) => (current !== null && usable.taals.some((tl) => tl.id === current) ? current : usable.taals[0]?.id ?? null));
      });
      return () => {
        player.stop();
        setPlaying(false);
      };
    }, [player]),
  );

  useEffect(() => {
    if (!playing) return;
    const tag = 'echo-me';
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [playing]);

  const taal = list?.taals.find((tl) => tl.id === taalId) ?? null;
  const plan = useMemo(() => (taal ? echoPlan(taal.bols, taal.divisions, vibhag, clicks) : null), [taal, vibhag, clicks]);
  const head = usePlayhead(player, playing && plan ? plan.pattern : null, bpm, playing, starts);
  const place = plan && head ? echoPlace(plan.segments, head.beat) : null;
  const segments = plan?.segments;
  const counts = useCallback((beat: number) => (segments ? echoPlace(segments, Math.floor(beat))?.phase === 'answer' : false), [segments]);

  const game = useTapGame({
    player,
    playing: playing && answerOn === 'pads',
    starts,
    hits: plan?.answers ?? [],
    beats: plan?.pattern.beats ?? 1,
    bpm,
    counts,
    bestKey: taal ? `echo:${taal.id}` : null,
    profileId,
    onTap: (hand, hit) => padSound.play(hit?.sound ?? PLAIN_TAP[hand]),
  });

  /** Starts the loop from beat 1, after `clicks` of count-in. */
  const startPlan = async (next: NonNullable<typeof plan>, nextBpm: number, countIn: number) => {
    player.stop();
    if (answerOn === 'pads') await padSound.prepare([...new Set([...next.answers.map((h) => h.sound), ...Object.values(PLAIN_TAP)])]);
    const ok = await player.start(next.pattern, nextBpm, countIn);
    setSoundFailed(!ok);
    if (!ok) return false;
    setStarts((n) => n + 1);
    setPlaying(true);
    return true;
  };

  const toggle = async () => {
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    if (plan && taal) await startPlan(plan, bpm, countInClicks('taal', 4, taal.divisions));
  };

  const stopSound = () => {
    player.stop();
    setPlaying(false);
  };

  const recordSetting: RecordingSetting | null = taal
    ? { mode: 'echo', taalId: taal.id, taalName: taal.name, taalBpm: bpm, speed: 1, vibhag, clicks }
    : null;

  const startSoundOf = async (s: RecordingSetting) => {
    if (s.mode !== 'echo') return false;
    const found = list?.taals.find((tl) => tl.id === s.taalId);
    const again = found ? echoPlan(found.bols, found.divisions, s.vibhag, s.clicks) : null;
    if (!found || !again) return false;
    setTaalId(found.id);
    setBpm(s.taalBpm);
    setVibhag(s.vibhag);
    setClicks(s.clicks);
    return startPlan(again, s.taalBpm, 0);
  };

  const chooseTaal = (id: number) => {
    setTaalId(id);
    setVibhag(null);
  };

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('echo.title') }} />
      <AppText tone="muted">{t('echo.intro')}</AppText>

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      <Section icon="reply" title={taal ? taal.name : t('echo.title')}>
        {list === undefined ? <LoadingCards /> : null}
        {list?.saved ? <Notice tone="info">{t('practice.savedTaals')}</Notice> : null}
        {list && list.taals.length === 0 ? <AppText tone="muted">{t('practice.noTaals')}</AppText> : null}
        {list && list.taals.length > 0 && !playing ? <TaalChips taals={list.taals} value={taalId} onChange={chooseTaal} /> : null}
        {taal && !playing ? <VibhagChoice taal={taal} value={vibhag} onChange={setVibhag} /> : null}
        <TempoStepper bpm={bpm} onChange={setBpm} disabled={playing} />
        <Button
          size="large"
          icon={playing ? 'pause' : 'play'}
          label={playing ? t('practice.stop') : t('practice.start')}
          disabled={!plan || tuning}
          onPress={() => void toggle()}
        />
        {playing && taal ? <EchoNow taal={taal} place={place} showBols={showBols} /> : null}
        {answerOn === 'pads' ? (
          <>
            <TapPads onTap={game.tap} guide={{ left: null, right: null }} fresh={false} feedback={game.feedback} />
            <CycleStars scores={game.scores} best={game.best} newBest={game.newBest} unit="round" />
          </>
        ) : null}
      </Section>

      <Section icon="settings" title={t('echo.howTitle')}>
        <ChoiceGroup<AnswerOn>
          segmented
          label={t('echo.answerOn')}
          value={answerOn}
          onChange={(next) => !playing && setAnswerOn(next)}
          choices={[
            { value: 'drum', label: t('echo.onDrum') },
            { value: 'pads', label: t('echo.onPads') },
          ]}
        />
        <Checkbox label={t('echo.clicks')} checked={clicks} onChange={(on) => !playing && setClicks(on)} />
        <Checkbox label={t('echo.showBols')} checked={showBols} onChange={setShowBols} />
        {answerOn === 'pads' ? <TuneLine player={player} busy={playing} onTuning={setTuning} /> : null}
      </Section>

      <View style={[styles.recordNote, { borderColor: colors.border }]}>
        <AppText variant="small" tone="muted">
          {t('echo.recordHint')}
        </AppText>
      </View>
      <RecordMyself kind="echo" setting={recordSetting} startSound={() => (plan ? startPlan(plan, bpm, 0) : Promise.resolve(false))} startSoundOf={startSoundOf} stopSound={stopSound} />
    </Screen>
  );
}

/** All vibhags in turn, or one of them again and again. */
function VibhagChoice({ taal, value, onChange }: { taal: Taal; value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useTranslation();
  const choices = [
    { value: -1, label: t('echo.allVibhags') },
    ...taal.divisions.map((beats, i) => ({ value: i, label: t('echo.vibhagChoice', { n: i + 1, mark: taal.marks[i] ?? '', beats }) })),
  ];
  return (
    <ChoiceGroup<number>
      chips
      label={t('echo.vibhag')}
      value={value ?? -1}
      onChange={(v) => onChange(v < 0 ? null : v)}
      choices={choices}
    />
  );
}

/** "Listen" or "Your turn", which vibhag, and its bols with the beat being heard marked. */
function EchoNow({ taal, place, showBols }: { taal: Taal; place: ReturnType<typeof echoPlace>; showBols: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!place) {
    return (
      <AppText variant="label" style={styles.centre}>
        {t('practice.countingIn')}
      </AppText>
    );
  }
  const { segment, phase, beat } = place;
  const answer = phase === 'answer';
  const beats = taal.bols.slice(segment.taalStart, segment.taalStart + segment.length);
  const hidden = answer && !showBols;
  return (
    <View
      style={[styles.now, { backgroundColor: answer ? colors.primarySoft : colors.surfaceSunken, borderColor: answer ? colors.accent : colors.cardBorder }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t(answer ? 'echo.yourTurn' : 'echo.listen')} · ${t('echo.vibhagOf', { n: segment.vibhag + 1, of: taal.divisions.length || 1 })}`}
    >
      <AppText variant="title" style={[styles.centre, answer ? { color: colors.onPrimarySoft } : null]}>
        {t(answer ? 'echo.yourTurn' : 'echo.listen')}
      </AppText>
      <AppText variant="small" tone="muted" style={styles.centre}>
        {t('echo.vibhagOf', { n: segment.vibhag + 1, of: taal.divisions.length || 1 })}
      </AppText>
      <View style={styles.beats}>
        {beats.map((b, i) => (
          <View
            key={i}
            style={[styles.beat, { borderColor: i === beat ? colors.accent : colors.border, backgroundColor: i === beat ? colors.surface : 'transparent' }]}
          >
            <AppText variant="label" family="sans">
              {hidden ? '•' : b === '-' ? '–' : b.replace(/\./g, ' ')}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    textAlign: 'center',
  },
  now: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 2,
    borderRadius: radius,
  },
  beats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  beat: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 2,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordNote: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
});
