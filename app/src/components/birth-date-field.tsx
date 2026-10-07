// Date of birth as three drop-downs side by side: day, month (its name in the app's language),
// year. Used by the sign-up (A1). The parts live in the form; src/lib/birth-date.ts checks them.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { birthYears, type BirthParts } from '@/lib/birth-date';
import { intlLocale } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { SelectField } from './select-field';

/** Props for BirthDateField. */
export type BirthDateFieldProps = {
  label: string;
  value: BirthParts;
  onChange: (value: BirthParts) => void;
  error?: string;
  hint?: string;
};

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/** The month names of the app's language, January first. */
function monthOptions(): { value: number; label: string }[] {
  let format: Intl.DateTimeFormat | null = null;
  try {
    format = new Intl.DateTimeFormat(intlLocale(), { month: 'long', timeZone: 'UTC' });
  } catch {
    format = null;
  }
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format ? format.format(new Date(Date.UTC(2000, i, 15))) : String(i + 1),
  }));
}

/** Day, month and year drop-downs under one label. */
export function BirthDateField({ label, value, onChange, error, hint }: BirthDateFieldProps) {
  const { t } = useTranslation();
  const years = birthYears().map((y) => ({ value: y, label: String(y) }));
  return (
    <View style={styles.wrapper} role="group" accessibilityLabel={label}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.row}>
        <SelectField compact label={t('birthDate.day')} options={DAYS} value={value.day}
          onChange={(day) => onChange({ ...value, day })} placeholder="—" invalid={!!error} />
        <SelectField compact label={t('birthDate.month')} options={monthOptions()} value={value.month}
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
