// G10 Settings, the Guru only: the class settings the database uses, in plain words: the open
// window, what "this week" means, when a student counts as Irregular or Inactive and how calls
// are planned, how long someone is a new joiner; and the promotion criteria that Phase 2 will
// read (shown as "not used yet"). Settings planned for later are listed at the end. Saved
// together, all or nothing; every change is in the audit log (G11). Data: src/data/settings.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { GuruOnly } from '@/components/guru-only';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  checkSettings,
  fetchSettings,
  NUMBER_SETTINGS,
  saveSettings,
  type NumberSetting,
  type SettingsErrors,
  type SettingsForm,
} from '@/data/settings';

/** The settings form. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [form, setForm] = useState<SettingsForm | null | undefined>(undefined);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setForm(await fetchSettings());
    setErrors({});
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('settings.title')} />;
  const header = <Stack.Screen options={{ title: t('settings.title') }} />;
  if (form === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (form === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('settings.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const setNumber = (key: NumberSetting, text: string) =>
    setForm({ ...form, numbers: { ...form.numbers, [key]: text.replace(/[^0-9]/g, '') } });
  const numberField = (key: NumberSetting) => (
    <TextField
      key={key}
      label={t(`settings.fields.${key}`)}
      hint={t('settings.rangeHint', NUMBER_SETTINGS[key])}
      value={form.numbers[key]}
      onChangeText={(text) => setNumber(key, text)}
      keyboardType="number-pad"
      maxLength={3}
      error={errors[key] ? t(errors[key], NUMBER_SETTINGS[key]) : undefined}
    />
  );

  async function save() {
    if (!form) return;
    const found = checkSettings(form);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) {
      setMessage({ tone: 'error', text: t('settings.fixFirst') });
      return;
    }
    setBusy(true);
    const result = await saveSettings(form);
    setBusy(false);
    setMessage(result.errorKey ? { tone: 'error', text: t(result.errorKey) } : { tone: 'success', text: t('settings.saved') });
    if (!result.errorKey) await load();
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('settings.intro')}</AppText>

      <Section icon="time" title={t('settings.windowTitle', { centre: form.centreName })} description={t('settings.windowHint')}>
        {form.centreId === null ? (
          <AppText tone="muted">{t('settings.noCentre')}</AppText>
        ) : (
          <>
            <TextField
              label={t('settings.opensAt')}
              value={form.opensAt}
              onChangeText={(opensAt) => setForm({ ...form, opensAt })}
              maxLength={5}
              hint={t('settings.timeHint')}
              error={errors.opensAt ? t(errors.opensAt) : undefined}
            />
            <TextField
              label={t('settings.closesAt')}
              value={form.closesAt}
              onChangeText={(closesAt) => setForm({ ...form, closesAt })}
              maxLength={5}
              hint={t('settings.timeHint')}
              error={errors.closesAt ? t(errors.closesAt) : undefined}
            />
          </>
        )}
      </Section>

      <Section icon="visits" title={t('settings.weekTitle')} description={t('settings.weekHint')}>
        <ChoiceGroup
          choices={[
            { value: 'monday', label: t('settings.weekMonday') },
            { value: 'rolling7', label: t('settings.weekRolling') },
          ]}
          value={form.weekStarts}
          onChange={(weekStarts) => setForm({ ...form, weekStarts })}
        />
      </Section>

      <Section icon="calls" title={t('settings.followTitle')} description={t('settings.followHint')}>
        {numberField('irregular_days')}
        {numberField('inactive_days')}
        {numberField('call_due_days')}
        {numberField('retry_days')}
        {numberField('max_retries')}
      </Section>

      <Section icon="newJoiner" title={t('settings.joinerTitle')}>
        {numberField('new_joiner_weeks')}
      </Section>

      <Section icon="level" title={t('settings.promotionTitle')} description={t('settings.promotionHint')}>
        <Checkbox
          label={t('settings.fields.promotion_whole_syllabus')}
          checked={form.flags.promotion_whole_syllabus}
          onChange={(on) => setForm({ ...form, flags: { ...form.flags, promotion_whole_syllabus: on } })}
        />
        {numberField('promotion_min_visits')}
        {numberField('promotion_visit_weeks')}
        <Checkbox
          label={t('settings.fields.promotion_level_up_assessment')}
          checked={form.flags.promotion_level_up_assessment}
          onChange={(on) => setForm({ ...form, flags: { ...form.flags, promotion_level_up_assessment: on } })}
        />
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button icon="check" label={t('settings.save')} loading={busy} onPress={() => void save()} />

      <Section icon="construction" title={t('settings.laterTitle')}>
        <AppText tone="muted">{t('settings.later')}</AppText>
      </Section>
    </Screen>
  );
}
