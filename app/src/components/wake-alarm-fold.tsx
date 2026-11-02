// The morning wake-up alarm on Practice tools (docs/DECISIONS.md #791-#793; lib/wake-alarm.ts), for everyone who
// opens Practice tools in the Android app: on or off, the time (the phone's own clock dialog, any minute), the days and
// the snooze length, saved with one button. Under it: when it rings next, Android's "Alarms & reminders" setting for
// exact time (Android 12 and later), and what the alarm can and cannot do, said plainly. In the browser, one line that
// it works in the Android app.

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  alarmTime,
  DEFAULT_WAKE_ALARM,
  exactAlarmSetting,
  nextRing,
  openExactAlarmSetting,
  readWakeAlarm,
  setWakeAlarm,
  SNOOZE_CHOICES,
  wakeAlarmPossible,
  WEEK_DAYS,
  type WakeAlarm,
  type WeekDay,
} from '@/lib/wake-alarm';
import { radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import { Fold } from './fold';
import { Icon } from './icon';
import { Notice } from './notice';

/** Props for WakeAlarmFold. */
export type WakeAlarmFoldProps = {
  profileId: string;
  /** The Practice tools of the person's area, opened by a tap on the alarm. */
  url: string;
};

/** The day names by JavaScript's day number, 0 Sunday; the short ones are the duty roster's. */
const DAY_SHORT = [
  'duty.weekdays.0',
  'duty.weekdays.1',
  'duty.weekdays.2',
  'duty.weekdays.3',
  'duty.weekdays.4',
  'duty.weekdays.5',
  'duty.weekdays.6',
] as const;
const DAY_LONG = [
  'wakeAlarm.dayLong0',
  'wakeAlarm.dayLong1',
  'wakeAlarm.dayLong2',
  'wakeAlarm.dayLong3',
  'wakeAlarm.dayLong4',
  'wakeAlarm.dayLong5',
  'wakeAlarm.dayLong6',
] as const;

/** "every day", "Mon to Fri", or the short day names. */
function daysText(t: TFunction, days: readonly WeekDay[]): string {
  if (days.length === 7) return t('wakeAlarm.everyDay');
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d as WeekDay))) return t('wakeAlarm.weekdays');
  return days.map((d) => t(DAY_SHORT[d])).join(' ');
}

/** The wake-up alarm, folded under one line that says whether and when it is set. */
export function WakeAlarmFold({ profileId, url }: WakeAlarmFoldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<WakeAlarm | null>(() => readWakeAlarm(profileId));
  const [on, setOn] = useState(saved !== null);
  const [draft, setDraft] = useState<WakeAlarm>(() => saved ?? DEFAULT_WAKE_ALARM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

  const pickTime = () => {
    const [hour, minute] = draft.time.split(':').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, hour, minute),
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => setDraft((d) => ({ ...d, time: alarmTime(date.getHours(), date.getMinutes()) })),
    });
  };

  const toggleDay = (day: WeekDay) =>
    setDraft((d) => ({ ...d, days: WEEK_DAYS.filter((w) => (w === day ? !d.days.includes(w) : d.days.includes(w))) }));

  const save = async () => {
    if (on && draft.days.length === 0) {
      setResult({ tone: 'error', text: t('wakeAlarm.noDays') });
      return;
    }
    setBusy(true);
    const outcome = await setWakeAlarm(profileId, on ? draft : null, url);
    setBusy(false);
    if (outcome === 'on') {
      setSaved(draft);
      const next = nextRing(draft, new Date());
      setResult({
        tone: 'success',
        text: next
          ? t('wakeAlarm.savedNext', { day: t(DAY_LONG[next.getDay()]), time: draft.time })
          : t('wakeAlarm.saved'),
      });
    } else if (outcome === 'off') {
      setSaved(null);
      setResult({ tone: 'info', text: t('wakeAlarm.turnedOff') });
    } else {
      setResult({ tone: 'error', text: t(outcome === 'denied' ? 'wakeAlarm.denied' : 'wakeAlarm.failed') });
    }
  };

  const title = saved ? t('wakeAlarm.titleAt', { time: saved.time, days: daysText(t, saved.days) }) : t('wakeAlarm.title');
  return (
    <Fold icon="time" title={title} description={t('wakeAlarm.intro')} open={open} onToggle={setOpen}>
      {wakeAlarmPossible ? (
        <>
          <Checkbox label={t('wakeAlarm.on')} checked={on} onChange={setOn} />
          {on ? (
            <>
              <View style={styles.field}>
                <AppText variant="label">{t('wakeAlarm.time')}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('wakeAlarm.time')}: ${draft.time}`}
                  accessibilityHint={t('wakeAlarm.timeHint')}
                  onPress={pickTime}
                  style={({ pressed }) => [
                    styles.box,
                    { backgroundColor: pressed ? colors.primarySoft : colors.surface, borderColor: colors.controlBorder },
                  ]}>
                  <AppText style={[styles.boxText, typography.body]}>{draft.time}</AppText>
                  <Icon name="time" color={colors.primary} />
                </Pressable>
              </View>
              <View style={styles.field}>
                <AppText variant="label" nativeID="wake-days">
                  {t('wakeAlarm.days')}
                </AppText>
                <View style={styles.days} accessibilityLabelledBy="wake-days">
                  {WEEK_DAYS.map((day) => {
                    const chosen = draft.days.includes(day);
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: chosen }}
                        accessibilityLabel={t(DAY_LONG[day])}
                        onPress={() => toggleDay(day)}
                        style={[
                          styles.day,
                          {
                            backgroundColor: chosen ? colors.primary : colors.surface,
                            borderColor: chosen ? colors.primary : colors.controlBorder,
                          },
                        ]}>
                        <AppText variant="label" style={{ color: chosen ? colors.onPrimary : colors.text }}>
                          {t(DAY_SHORT[day])}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <ChoiceGroup<number>
                segmented
                label={t('wakeAlarm.snooze')}
                value={draft.snooze}
                onChange={(snooze) => setDraft((d) => ({ ...d, snooze }))}
                choices={SNOOZE_CHOICES.map((m) => ({ value: m, label: t('practice.minutes', { m }) }))}
              />
            </>
          ) : null}
          {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
          <Button icon="check" label={t('wakeAlarm.save')} loading={busy} onPress={save} />
          {on && exactAlarmSetting ? (
            <>
              <AppText variant="small" tone="muted">
                {t('wakeAlarm.exactHint')}
              </AppText>
              <Button variant="secondary" icon="settings" label={t('wakeAlarm.exactOpen')} onPress={openExactAlarmSetting} />
            </>
          ) : null}
          <AppText variant="small" tone="muted">
            {t('wakeAlarm.limits')}
          </AppText>
        </>
      ) : (
        <Notice tone="info">{t('wakeAlarm.appOnly')}</Notice>
      )}
    </Fold>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  boxText: {
    flex: 1,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  day: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1.5,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
