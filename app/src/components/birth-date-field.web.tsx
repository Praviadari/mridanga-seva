// Date of birth on the web as three drop-downs side by side: day, month (its name in the app's language),
// year. The phone opens its calendar instead (birth-date-field.tsx, docs/DECISIONS.md #270). Used by the sign-up
// and Register a student. The parts live in the form; src/lib/birth-date.ts checks them.

import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { birthYears, type BirthParts } from '@/lib/birth-date';
import { intlLocale } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { SelectField } from './select-field';

/** Props for BirthDateField (the same as on the phone). */
export type BirthDateFieldProps = {
  label: string;
  value: BirthParts;
  onChange: (value: BirthParts) => void;
  error?: string;
  hint?: string;
  /** The phone's calendar opens this many years back; the year list here starts 25 years back. */
  startAge?: number;
  /** Lets a form scroll to this field (components/form-focus.tsx). */
  ref?: Ref<View>;
};

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/**
 * The month names of `language`, January first. Passed in, not read inside, so the list follows a language
 * switch under the React Compiler (audit P1-04, docs/DECISIONS.md #334).
 */
function monthOptions(language: string): { value: number; label: string }[] {
  let format: Intl.DateTimeFormat | null = null;
  try {
    format = new Intl.DateTimeFormat(intlLocale(language), { month: 'long', timeZone: 'UTC' });
  } catch {
    format = null;
  }
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format ? format.format(new Date(Date.UTC(2000, i, 15))) : String(i + 1),
  }));
}

/** Day, month and year drop-downs under one label. */
export function BirthDateField({ label, value, onChange, error, hint, ref }: BirthDateFieldProps) {
  const { t, i18n } = useTranslation();
  const years = birthYears().map((y) => ({ value: y, label: String(y) }));
  return (
    <View ref={ref} style={styles.wrapper} role="group" accessibilityLabel={label}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.row}>
        <SelectField compact label={t('birthDate.day')} options={DAYS} value={value.day}
          onChange={(day) => onChange({ ...value, day })} placeholder="—" invalid={!!error} />
        <SelectField compact label={t('birthDate.month')} options={monthOptions(i18n.language)} value={value.month}
          onChange={(month) => onChange({ ...value, month })} placeholder="—" invalid={!!error} />
        <SelectField compact label={t('birthDate.year')} options={years} value={value.year} startAt={years[25]?.value}
          onChange={(year) => onChange({ ...value, year })} placeholder="—" invalid={!!error} />
      </View>
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
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
