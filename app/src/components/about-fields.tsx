// The fields of About you (team MoM 05-10-2026, docs/DECISIONS.md #164), in four parts that the
// About-you steps show one at a time and the desk's forms (C2, C8) show together. Every list comes
// from the Guru's option lists (src/data/options.ts); "Other" opens a text box. Each optional part
// says why it is asked (the privacy notice states the same purposes).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AboutContext, AboutErrors, AboutForm, Referrer } from '@/data/about';
import { MINOR_RELATIONS } from '@/data/about';
import { optionLabel, OTHER, type Option, type OptionSets } from '@/data/options';
import { callingCode, countryName, PHONE_COUNTRIES, type CountryCode } from '@/lib/phone';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import { SelectField } from './select-field';
import { TextField } from './text-field';

/** Props shared by the parts. */
type PartProps = {
  form: AboutForm;
  set: <K extends keyof AboutForm>(key: K, value: AboutForm[K]) => void;
  errors: AboutErrors;
  options: OptionSets;
  context: AboutContext;
};

/** Options as ChoiceGroup / SelectField choices in the app's language. */
function useChoices(options: readonly Option[]) {
  const { i18n } = useTranslation();
  return options.map((o) => ({ value: o.code, label: optionLabel(o, i18n.language) }));
}

/** The countries for a phone, by name in the app's language, with their calling codes. */
function useCountryOptions() {
  const { i18n } = useTranslation();
  return useMemo(
    () =>
      PHONE_COUNTRIES.map((c) => ({ value: c, label: `${countryName(c, i18n.language)} (${callingCode(c)})` })).sort((a, b) =>
        a.label.localeCompare(b.label, i18n.language),
      ),
    [i18n.language],
  );
}

/** Props for PhoneField. */
type PhoneFieldProps = {
  label: string;
  country: CountryCode;
  onCountry: (country: CountryCode) => void;
  number: string;
  onNumber: (number: string) => void;
  error?: string;
  hint?: string;
};

/** A phone number: the country (calling code) and the number as dialled there. */
export function PhoneField({ label, country, onCountry, number, onNumber, error, hint }: PhoneFieldProps) {
  const { t } = useTranslation();
  const countries = useCountryOptions();
  return (
    <View style={styles.group} role="group" accessibilityLabel={label}>
      <SelectField label={t('about.phoneCountry', { label })} options={countries} value={country} onChange={onCountry} />
      <TextField
        label={label}
        value={number}
        onChangeText={onNumber}
        error={error}
        hint={hint ?? t('about.phoneHint', { code: callingCode(country) })}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
    </View>
  );
}

/** Props for InstrumentChecks. */
type InstrumentChecksProps = { options: readonly Option[]; value: readonly string[]; onChange: (codes: string[]) => void };

/** "Interested in learning": a tick per instrument, and "All" that ticks or clears every one. */
export function InstrumentChecks({ options, value, onChange }: InstrumentChecksProps) {
  const { t } = useTranslation();
  const choices = useChoices(options);
  if (choices.length === 0) return null;
  const all = choices.every((c) => value.includes(c.value));
  return (
    <View style={styles.group} role="group" accessibilityLabel={t('about.learn')}>
      <AppText variant="label">{t('about.learn')}</AppText>
      {choices.map((c) => (
        <Checkbox key={c.value} label={c.label} checked={value.includes(c.value)}
          onChange={(on) => onChange(on ? [...value, c.value] : value.filter((v) => v !== c.value))} />
      ))}
      <Checkbox label={t('about.learnAll')} checked={all} onChange={(on) => onChange(on ? choices.map((c) => c.value) : [])} />
    </View>
  );
}

/** Gender (when not given yet), Diksha name, instruments and own phone. Staff forms leave out the phone. */
export function YouPart({ form, set, errors, options, context }: PartProps) {
  const { t } = useTranslation();
  const genders = useChoices(options.gender);
  return (
    <>
      <TextField label={t('about.dikshaName')} hint={t('about.dikshaHint')} value={form.dikshaName}
        onChangeText={(v) => set('dikshaName', v)} error={errors.dikshaName && t(errors.dikshaName)}
        autoComplete="off" autoCapitalize="words" maxLength={80} />
      <InstrumentChecks options={options.instrument} value={form.learnInterests} onChange={(codes) => set('learnInterests', codes)} />
      {genders.length > 0 ? (
        <ChoiceGroup label={t('about.gender')} choices={genders} value={form.gender} onChange={(g) => set('gender', g)}
          error={errors.gender && t(errors.gender)} />
      ) : null}
      {context.staff ? null : (
        <PhoneField
          label={t('about.phone')}
          country={form.phoneCountry}
          onCountry={(c) => set('phoneCountry', c)}
          number={form.phone}
          onNumber={(n) => set('phone', n)}
          error={errors.phone && t(errors.phone)}
        />
      )}
      {context.staff ? null : <AppText variant="small" tone="muted">{t('about.phonePurpose')}</AppText>}
    </>
  );
}

/** Emergency contact: relation, name, phone. Required under 18 without a guardian on record. */
export function EmergencyPart({ form, set, errors, options, context }: PartProps) {
  const { t } = useTranslation();
  const all = useChoices(options.relation);
  const relations = context.minor ? all.filter((r) => MINOR_RELATIONS.includes(r.value)) : all;
  return (
    <>
      <AppText variant="small" tone="muted">
        {context.minor && !context.hasGuardian ? t('about.emergencyRequired') : t('about.emergencyPurpose')}
      </AppText>
      <ChoiceGroup label={t('about.relation')} choices={relations} value={form.emergencyRelation}
        onChange={(r) => set('emergencyRelation', r)} error={errors.emergencyRelation && t(errors.emergencyRelation)} />
      <TextField label={t('about.emergencyName')} value={form.emergencyName} onChangeText={(v) => set('emergencyName', v)}
        error={errors.emergencyName && t(errors.emergencyName)} autoComplete="off" autoCapitalize="words" maxLength={80} />
      <PhoneField
        label={t('about.emergencyPhone')}
        country={form.emergencyCountry}
        onCountry={(c) => set('emergencyCountry', c)}
        number={form.emergencyPhone}
        onNumber={(n) => set('emergencyPhone', n)}
        error={errors.emergencyPhone && t(errors.emergencyPhone)}
      />
    </>
  );
}

/** How did you hear about us: a coordinator's referral code (staff: the coordinator) or a source. */
export function HeardPart({ form, set, errors, options, context, referrers }: PartProps & { referrers?: readonly Referrer[] }) {
  const { t } = useTranslation();
  const sources = useChoices(options.source);
  const choices = [{ value: 'referral', label: t('about.referred') }, ...sources];
  return (
    <>
      <AppText variant="small" tone="muted">{t('about.heardPurpose')}</AppText>
      <ChoiceGroup label={t('about.heard')} choices={choices} value={form.heardVia} onChange={(v) => set('heardVia', v)} />
      {form.heardVia === 'referral' && !context.staff ? (
        <TextField label={t('about.referralCode')} hint={t('about.referralCodeHint')} value={form.referralCode}
          onChangeText={(v) => set('referralCode', v.toUpperCase())} error={errors.referralCode && t(errors.referralCode)}
          autoCapitalize="characters" autoComplete="off" autoCorrect={false} maxLength={8} />
      ) : null}
      {form.heardVia === 'referral' && context.staff ? (
        <SelectField label={t('about.referredBy')} options={(referrers ?? []).map((r) => ({ value: r.id, label: r.fullName }))}
          value={form.referredBy} onChange={(id) => set('referredBy', id)} error={errors.referredBy && t(errors.referredBy)} />
      ) : null}
      {form.heardVia === OTHER ? (
        <TextField label={t('about.otherText')} value={form.heardOther} onChangeText={(v) => set('heardOther', v)}
          error={errors.heardOther && t(errors.heardOther)} maxLength={80} />
      ) : null}
    </>
  );
}

/** Occupation and service areas of interest (tick any). */
export function OccupationPart({ form, set, errors, options }: PartProps) {
  const { t } = useTranslation();
  const occupations = useChoices(options.occupation);
  const services = useChoices(options.service_area);
  const toggle = (code: string, on: boolean) =>
    set('serviceAreas', on ? [...form.serviceAreas, code] : form.serviceAreas.filter((c) => c !== code));
  return (
    <>
      <AppText variant="small" tone="muted">{t('about.occupationPurpose')}</AppText>
      <ChoiceGroup label={t('about.occupation')} choices={occupations} value={form.occupation}
        onChange={(v) => set('occupation', v)} />
      {form.occupation === OTHER ? (
        <TextField label={t('about.otherText')} value={form.occupationOther} onChangeText={(v) => set('occupationOther', v)}
          error={errors.occupationOther && t(errors.occupationOther)} maxLength={80} />
      ) : null}
      <View style={styles.group} role="group" accessibilityLabel={t('about.services')}>
        <AppText variant="label">{t('about.services')}</AppText>
        <AppText variant="small" tone="muted">{t('about.servicesHint')}</AppText>
        {services.map((s) => (
          <Checkbox key={s.value} label={s.label} checked={form.serviceAreas.includes(s.value)} onChange={(on) => toggle(s.value, on)} />
        ))}
      </View>
      {form.serviceAreas.includes(OTHER) ? (
        <TextField label={t('about.otherService')} value={form.serviceOther} onChangeText={(v) => set('serviceOther', v)}
          error={errors.serviceOther && t(errors.serviceOther)} maxLength={80} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
});
