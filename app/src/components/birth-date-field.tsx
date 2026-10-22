// Date of birth on the phone: a box showing the date; a tap opens the phone's own calendar
// (@react-native-community/datetimepicker, docs/DECISIONS.md #270), between 100 years ago and today,
// opening `startAge` years back when nothing is picked yet. Praveen's test 12-10-2026 found no
// calendar on the drop-downs. The web keeps the day / month / year drop-downs (birth-date-field.web.tsx).
// Used by the sign-up and Register a student; src/lib/birth-date.ts checks the date.

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { birthDateOf, pickerRange, type BirthParts } from '@/lib/birth-date';
import { formatTypedDate, intlLocale } from '@/lib/dates';
import { radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for BirthDateField (the same on the web). */
export type BirthDateFieldProps = {
  label: string;
  value: BirthParts;
  onChange: (value: BirthParts) => void;
  error?: string;
  hint?: string;
  /** How many years back the calendar opens when no date is picked. Default 18. */
  startAge?: number;
  /** Lets a form scroll to this field (components/form-focus.tsx). */
  ref?: Ref<View>;
};

/** The parts as a Date at local midnight, for the picker. */
function toDate(parts: BirthParts): Date {
  return new Date(parts.year ?? 2000, (parts.month ?? 1) - 1, parts.day ?? 1);
}

/** The picked Date as parts. */
function toParts(date: Date): BirthParts {
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
}

/**
 * '15 June 2012' in `language`; the typed form when Intl cannot name the month. The language is passed in, not
 * read inside: the React Compiler keeps a call's answer while its arguments stay the same, so a date read the
 * language itself stayed English after a switch to Telugu (audit P1-04, docs/DECISIONS.md #334).
 */
function longDate(iso: string, language: string): string {
  try {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(intlLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, day)),
    );
  } catch {
    return formatTypedDate(iso);
  }
}

/** A box that opens the phone's calendar. */
export function BirthDateField({ label, value, onChange, error, hint, startAge = 18, ref }: BirthDateFieldProps) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  // iPhone: the picker shows under the box (no dialog API there).
  const [iosOpen, setIosOpen] = useState(false);
  const iso = birthDateOf(value);
  const range = pickerRange(startAge);
  const current = toDate(iso ? value : range.start);
  const note = error ?? hint;

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        display: 'calendar',
        minimumDate: toDate(range.min),
        maximumDate: toDate(range.max),
        onValueChange: (_event, date) => onChange(toParts(date)),
      });
    } else {
      setIosOpen(!iosOpen);
    }
  }

  return (
    <View ref={ref} collapsable={false} style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${iso ? longDate(iso, i18n.language) : t('birthDate.pick')}`}
        accessibilityHint={note ? `${note} ${t('birthDate.opensCalendar')}` : t('birthDate.opensCalendar')}
        onPress={open}
        style={({ pressed }) => [
          styles.box,
          {
            backgroundColor: pressed ? colors.primarySoft : colors.surface,
            borderColor: error ? colors.danger : colors.controlBorder,
          },
        ]}>
        <AppText style={[styles.value, typography.body]} tone={iso ? undefined : 'muted'}>
          {iso ? longDate(iso, i18n.language) : t('birthDate.pick')}
        </AppText>
        <Icon name="date" color={colors.primary} />
      </Pressable>
      {iosOpen && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          minimumDate={toDate(range.min)}
          maximumDate={toDate(range.max)}
          onValueChange={(_event, date) => onChange(toParts(date))}
        />
      ) : null}
      {error ? (
        <AppText variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
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
  value: {
    flex: 1,
  },
});
