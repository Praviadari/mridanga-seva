// More on S5 Practice tools (docs/DECISIONS.md #400-#405):
// - MantraEntry: "Mantra before practice" at the top, to the mantra reader (screens/mantra-reader.tsx).
// - PlanSection: the teachers' practice of the week for the student's level (practice_plans, migration 0052): each
//   taal at its tempo with Start, each lesson video with Watch, the note and the weekly goal.
// - SpeedTrainerFields: the speed trainer's settings and where it is (faster by, each step, after every bars/cycles).
// - CycleNow, StopAfterChoice: which bar or cycle is playing, and stop after 4/8/16/32.
// - StepControls: the taal's strokes one at a time, with the hands shown and Hear it (#404).
// - GoalFold: the student's own weekly goal (practice_goals), or back to the class's.
// - ReminderFold: the daily practice reminder (lib/practice-reminder.ts), Android app only.

import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { levelName } from '@/i18n/labels';
import type { Mantra } from '@/data/mantras';
import { setMyPracticeGoal, type MyPracticePlan, type PracticeDays, type Taal } from '@/data/practice';
import { ownAreaOf } from '@/lib/own-area';
import { GOAL_MINUTE_CHOICES } from '@/lib/practice-goal';
import { cyclesToNextStep, trainerTempo, type SpeedTrainer } from '@/lib/practice-pattern';
import { readReminder, REMINDER_TIMES, remindersPossible, setReminder, type ReminderTime } from '@/lib/practice-reminder';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import { Fold } from './fold';
import { ListRow } from './list-row';
import { MoreText } from './more-text';
import { Notice } from './notice';
import { Section } from './section';

/** Props for MantraEntry. */
export type MantraEntryProps = {
  area: 'student' | 'staff';
  /** The mantras switched on (data/mantras.ts; the copy on the phone while loading or offline). */
  mantras: readonly Mantra[];
  /** The Guru or an Ishtagoshti editor. */
  canEdit: boolean;
};

/**
 * "Mantra before practice" at the top of Practice tools (#405): one tap to the reader. Nothing for students until the
 * Guru has added one; staff who may edit see "Add the mantra" instead.
 */
export function MantraEntry({ area, mantras, canEdit }: MantraEntryProps) {
  const { t } = useTranslation();
  if (mantras.length > 0) {
    return (
      <ListRow
        leading="sloka"
        title={t('mantras.entry')}
        details={[mantras.map((m) => m.title).join(' · ')]}
        onPress={() => router.push(area === 'staff' ? '/staff/mantra' : '/student/mantra')}
      />
    );
  }
  if (area === 'staff' && canEdit) {
    return (
      <Button
        variant="secondary"
        icon="sloka"
        label={t('mantras.addFirst')}
        onPress={() => router.push({ pathname: '/staff/mantras/[id]', params: { id: 'new' } })}
      />
    );
  }
  return null;
}

/** Props for PlanSection. */
export type PlanSectionProps = {
  mine: MyPracticePlan;
  /** The taals the player can play (switched on). */
  taals: readonly Taal[];
  /** Starts a taal of the plan at its tempo (from the lead-in when it is on). */
  onStartTaal: (taal: Taal, bpm: number) => void;
};

/**
 * The practice of the week, shown above the tools when the teachers set something for the student's level. An item
 * the student cannot use (a taal switched off since, a lesson not open to them) is left out.
 */
export function PlanSection({ mine, taals, onStartTaal }: PlanSectionProps) {
  const { t } = useTranslation();
  const { plan, lessons } = mine;
  // A student's S5, or Me > Practice of a staff member's own record (0053, #319): the lesson opens in the same app.
  const lessonPath = ownAreaOf(usePathname()) === 'me' ? '/staff/lesson/[id]' : '/student/lesson/[id]';
  const rows = plan.items.flatMap((item, i) => {
    if (item.kind === 'taal') {
      const taal = taals.find((tl) => tl.id === item.taalId);
      if (!taal) return [];
      return [
        <ListRow
          key={`t${i}`}
          leading="taal"
          title={taal.name}
          details={[t('practice.planTempo', { bpm: item.bpm })]}
          action={{ label: t('practice.planStart'), variant: 'primary', onPress: () => onStartTaal(taal, item.bpm) }}
        />,
      ];
    }
    const lesson = lessons.get(item.materialId);
    if (!lesson) return [];
    return [
      <ListRow
        key={`l${i}`}
        leading="lessonVideo"
        title={lesson.title}
        details={[t('practice.planLesson')]}
        action={{ label: t('practice.planWatch'), variant: 'secondary', onPress: () => router.push({ pathname: lessonPath, params: { id: String(lesson.id) } }) }}
      />,
    ];
  });
  if (rows.length === 0 && !plan.note) return null;
  return (
    <Section icon="todo" title={t('practice.planTitle')} description={t('practice.planFrom', { level: levelName(t, plan.levelId) })}>
      {plan.note ? <MoreText text={plan.note} /> : null}
      {rows}
      <AppText variant="small" tone="muted">
        {t('practice.planGoal', { days: plan.goal.days, minutes: plan.goal.minutes })}
      </AppText>
    </Section>
  );
}

/** Props for SpeedTrainerFields. */
export type SpeedTrainerFieldsProps = {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** Faster by, in all, from the tempo it started at. */
  total: number;
  onTotal: (total: number) => void;
  trainer: Omit<SpeedTrainer, 'target'>;
  onTrainer: (trainer: Omit<SpeedTrainer, 'target'>) => void;
  /** 'bars' for the metronome, 'cycles' for the taal player. */
  unit: 'bars' | 'cycles';
  /** While it plays: the tempo it started from and the cycles since. */
  running: { base: number; cycles: number } | null;
};

/** The speed trainer (#400): a tick box, then its three settings and where it is while the sound plays. */
export function SpeedTrainerFields({ on, onToggle, total, onTotal, trainer, onTrainer, unit, running }: SpeedTrainerFieldsProps) {
  const { t } = useTranslation();
  const full = running ? { ...trainer, target: running.base + total } : null;
  const now = running && full ? trainerTempo(running.base, full, running.cycles) : null;
  const left = running && full ? cyclesToNextStep(running.base, full, running.cycles) : null;
  return (
    <View style={styles.trainer}>
      <Checkbox label={t('practice.trainer')} checked={on} onChange={onToggle} />
      {on ? (
        <>
          <AppText variant="small" tone="muted">
            {t('practice.trainerHint')}
          </AppText>
          <ChoiceGroup<number>
            segmented
            label={t('practice.trainerTotal')}
            value={total}
            onChange={onTotal}
            choices={[10, 20, 30, 40].map((n) => ({ value: n, label: `+${n}` }))}
          />
          <ChoiceGroup<number>
            segmented
            label={t('practice.trainerStep')}
            value={trainer.step}
            onChange={(step) => onTrainer({ ...trainer, step })}
            choices={[1, 2, 5, 10].map((n) => ({ value: n, label: `+${n}` }))}
          />
          <ChoiceGroup<number>
            segmented
            label={unit === 'bars' ? t('practice.trainerEveryBars') : t('practice.trainerEveryCycles')}
            value={trainer.every}
            onChange={(every) => onTrainer({ ...trainer, every })}
            choices={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))}
          />
          {running && full && now !== null ? (
            <AppText variant="label" accessibilityLiveRegion="polite">
              {left === null
                ? t('practice.trainerReached', { bpm: full.target })
                : t(unit === 'bars' ? 'practice.trainerNextBars' : 'practice.trainerNextCycles', {
                    count: left,
                    bpm: now,
                    next: Math.min(full.target, now + trainer.step),
                  })}
            </AppText>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Props for CycleNow. */
export type CycleNowProps = {
  /** Cycles completed since beat 1, while it plays; null before it (the count-in). */
  cycles: number | null;
  playing: boolean;
  /** 'bars' for the metronome, 'cycles' for the taal player. */
  unit: 'bars' | 'cycles';
  /** Stop after this many; 0 = go on. */
  stopAfter: number;
  /** The sound stopped by itself after this many, or null. */
  stoppedAfter: number | null;
};

/** The cycle counter (#403), under Start: "Count-in…", "Cycle 3 of 8", or that it stopped after 8. */
export function CycleNow({ cycles, playing, unit, stopAfter, stoppedAfter }: CycleNowProps) {
  const { t } = useTranslation();
  const text = playing
    ? cycles === null
      ? t('practice.countingIn')
      : stopAfter > 0
        ? t(unit === 'bars' ? 'practice.barOf' : 'practice.cycleOf', { n: Math.min(cycles + 1, stopAfter), of: stopAfter })
        : t(unit === 'bars' ? 'practice.barNow' : 'practice.cycleNow', { n: cycles + 1 })
    : stoppedAfter !== null
      ? t(unit === 'bars' ? 'practice.stoppedAfterBars' : 'practice.stoppedAfterCycles', { count: stoppedAfter })
      : null;
  if (!text) return null;
  return (
    <AppText variant="subtitle" family="sans" style={styles.center} accessibilityLiveRegion="polite">
      {text}
    </AppText>
  );
}

/** Props for StopAfterChoice. */
export type StopAfterChoiceProps = { unit: 'bars' | 'cycles'; value: number; onChange: (n: number) => void };

/** Stop after 4, 8, 16 or 32 bars or cycles, or go on (#403). */
export function StopAfterChoice({ unit, value, onChange }: StopAfterChoiceProps) {
  const { t } = useTranslation();
  return (
    <ChoiceGroup<number>
      segmented
      label={t(unit === 'bars' ? 'practice.stopAfterBars' : 'practice.stopAfterCycles')}
      value={value}
      onChange={onChange}
      choices={[0, 4, 8, 16, 32].map((n) => ({ value: n, label: n === 0 ? t('practice.stopAfterOff') : String(n) }))}
    />
  );
}

/** Props for StepControls. */
export type StepControlsProps = {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** The stroke shown (0-based) and how many there are. */
  index: number;
  total: number;
  /** The shown stroke's beat (0-based), for the words. */
  beat: number | null;
  onIndex: (index: number) => void;
  onHear: () => void;
};

/** The step mode (#404): one stroke at a time, Previous / Next, and Hear it (the stroke once). */
export function StepControls({ on, onToggle, index, total, beat, onIndex, onHear }: StepControlsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.trainer}>
      <Checkbox label={t('practice.stepMode')} checked={on} onChange={onToggle} />
      {on && total > 0 ? (
        <>
          <AppText variant="label" style={styles.center} accessibilityLiveRegion="polite">
            {t('practice.stepWhere', { n: index + 1, total, beat: (beat ?? 0) + 1 })}
          </AppText>
          <View style={styles.stepButtons}>
            <View style={styles.stepButton}>
              <Button variant="secondary" icon="previous" label={t('practice.stepPrevious')} disabled={index <= 0} onPress={() => onIndex(index - 1)} />
            </View>
            <View style={styles.stepButton}>
              <Button variant="secondary" icon="chevron" label={t('practice.stepNext')} disabled={index >= total - 1} onPress={() => onIndex(index + 1)} />
            </View>
          </View>
          <Button icon="play" label={t('practice.stepHear')} onPress={onHear} />
        </>
      ) : null}
    </View>
  );
}

/** Props for GoalFold. */
export type GoalFoldProps = { practice: PracticeDays; onSaved: () => void };

/** The student's own weekly goal (#400): days a week and minutes a day, or back to the class's goal. */
export function GoalFold({ practice, onSaved }: GoalFoldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(practice.goal.days);
  const [minutes, setMinutes] = useState(practice.goal.minutes);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const save = async (goal: { days: number; minutes: number } | null) => {
    setBusy(true);
    const errorKey = await setMyPracticeGoal(goal);
    setBusy(false);
    setResult(errorKey ? { tone: 'error', text: t(errorKey) } : { tone: 'success', text: t(goal ? 'practice.goalSaved' : 'practice.goalReset') });
    if (!errorKey) onSaved();
  };

  return (
    <Fold
      icon="edit"
      title={t('practice.goalChange', { days: practice.goal.days, minutes: practice.goal.minutes })}
      description={t('practice.goalChangeIntro')}
      open={open}
      onToggle={setOpen}>
      <ChoiceGroup<number>
        segmented
        label={t('practice.goalDaysLabel')}
        value={days}
        onChange={setDays}
        choices={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
      />
      <ChoiceGroup<number>
        chips
        label={t('practice.goalMinutesLabel')}
        value={minutes}
        onChange={setMinutes}
        choices={[...new Set([...GOAL_MINUTE_CHOICES, practice.goal.minutes])]
          .sort((a, b) => a - b)
          .map((n) => ({ value: n, label: t('practice.minutes', { m: n }) }))}
      />
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      <Button icon="check" label={t('practice.goalSave')} loading={busy} onPress={() => void save({ days, minutes })} />
      {practice.own ? (
        <Button variant="secondary" label={t('practice.goalUseClass')} disabled={busy} onPress={() => void save(null)} />
      ) : null}
    </Fold>
  );
}

/** Props for ReminderFold. */
export type ReminderFoldProps = { profileId: string };

/** The daily practice reminder (#402): off or a time; in the browser, a line that it needs the Android app. */
export function ReminderFold({ profileId }: ReminderFoldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<ReminderTime | 'off'>(() => readReminder(profileId) ?? 'off');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

  const choose = async (next: ReminderTime | 'off') => {
    if (busy) return;
    setBusy(true);
    const outcome = await setReminder(profileId, next === 'off' ? null : next);
    setBusy(false);
    if (outcome === 'on') {
      setTime(next);
      setResult({ tone: 'success', text: t('practice.reminderOn', { time: next }) });
    } else if (outcome === 'off') {
      setTime('off');
      setResult({ tone: 'info', text: t('practice.reminderTurnedOff') });
    } else {
      setTime(readReminder(profileId) ?? 'off');
      setResult({ tone: 'error', text: t(outcome === 'denied' ? 'practice.reminderDenied' : 'practice.reminderFailed') });
    }
  };

  const title = time === 'off' ? t('practice.reminder') : t('practice.reminderAt', { time });
  return (
    <Fold icon="bell" title={title} description={t('practice.reminderIntro')} open={open} onToggle={setOpen}>
      {remindersPossible ? (
        <ChoiceGroup<string>
          chips
          label={t('practice.reminderTime')}
          value={time}
          onChange={(value) => void choose(value)}
          choices={[{ value: 'off', label: t('practice.reminderOff') }, ...REMINDER_TIMES.map((tm) => ({ value: tm, label: tm }))]}
        />
      ) : (
        <Notice tone="info">{t('practice.reminderAppOnly')}</Notice>
      )}
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
    </Fold>
  );
}

const styles = StyleSheet.create({
  trainer: {
    gap: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  stepButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepButton: {
    flex: 1,
  },
});
