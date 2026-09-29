// C2 Register a student, with C3 Guardian consent for students under 18.
// A coordinator (or the Guru) fills this in at the desk in about two minutes. When the date of
// birth shows the student is under 18, the parent-and-consent part appears and must be completed
// before anything is saved: a minor's details are never stored without consent
// (docs/DECISIONS.md #8, #16). Saving calls register_student (src/data/students.ts), which
// stores the student, guardian and consent together and gives the roll number.

import { router, Stack } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageKey } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  ageFromForm,
  checkGuardianConsent,
  checkStudentDetails,
  emptyRegistration,
  fetchRegistrationChoices,
  ID_TYPES,
  registerStudent,
  RELATIONS,
  type LevelOption,
  type MentorOption,
  type Registered,
  type RegistrationErrors,
  type RegistrationForm,
} from '@/data/students';

type Choices = { levels: LevelOption[]; mentors: MentorOption[] };

/** Registration form, then a confirmation with the new roll number. */
export default function RegisterStudentScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // A coordinator is usually the new student's mentor; the Guru picks one.
  const defaultMentor = profile?.role === 'coordinator' ? profile.id : null;

  // undefined = still loading, null = could not load.
  const [choices, setChoices] = useState<Choices | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [form, setForm] = useState<RegistrationForm>(() => emptyRegistration(defaultMentor));
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ registered: Registered; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationChoices().then((result) => {
      if (!cancelled) setChoices(result);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  /** Returns a change handler for one form field. */
  function field<K extends keyof RegistrationForm>(key: K) {
    return (value: RegistrationForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  }
  /** The translated error for one field, if any. */
  function errorFor(key: keyof RegistrationForm): string | undefined {
    const messageKey = errors[key];
    return messageKey ? t(messageKey) : undefined;
  }

  const age = ageFromForm(form.dob);
  const minor = age?.minor ?? false;

  async function save() {
    const found = { ...checkStudentDetails(form), ...(minor ? checkGuardianConsent(form) : {}) };
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('register.errors.fixFields');
      return;
    }
    setFormError(null);
    setBusy(true);
    const result = await registerStudent(form);
    setBusy(false);
    if (result.registered) setSaved({ registered: result.registered, name: form.fullName.trim() });
    else setFormError(result.errorKey ?? 'common.genericError');
  }

  function registerAnother() {
    setForm(emptyRegistration(defaultMentor));
    setErrors({});
    setSaved(null);
  }

  const header = <Stack.Screen options={{ title: t('register.title') }} />;

  if (saved) {
    return (
      <Screen underHeader>
        {header}
        <Notice tone="success" title={t('register.doneTitle')}>
          {t('register.doneBody', { name: saved.name, rollNo: saved.registered.rollNo })}
        </Notice>
        {saved.registered.linked ? <AppText>{t('register.linked')}</AppText> : null}
        <Button label={t('register.another')} onPress={registerAnother} />
        <Button
          variant="secondary"
          label={t('register.done')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  if (choices === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('register.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('register.intro')}</AppText>

      <Section title={t('register.studentSection')}>
        <TextField
          label={t('register.fullName')}
          value={form.fullName}
          onChangeText={field('fullName')}
          error={errorFor('fullName')}
          autoComplete="off"
          autoCapitalize="words"
        />
        <TextField
          label={t('register.dob')}
          value={form.dob}
          onChangeText={field('dob')}
          error={errorFor('dob')}
          // Once a real date is typed, the hint shows the age, so the coordinator sees at once
          // whether the parent's consent will be needed.
          hint={
            age
              ? t(age.minor ? 'register.ageMinor' : 'register.age', { age: age.age })
              : t('register.dobHint')
          }
          placeholder="15-06-2012"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TextField
          label={t('register.phone')}
          value={form.phone}
          onChangeText={field('phone')}
          error={errorFor('phone')}
          keyboardType="phone-pad"
          autoComplete="off"
        />
        <TextField
          label={t('register.email')}
          hint={t('register.emailHint')}
          value={form.email}
          onChangeText={field('email')}
          error={errorFor('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="off"
        />
        <TextField
          label={t('register.area')}
          hint={t('register.areaHint')}
          value={form.area}
          onChangeText={field('area')}
          autoComplete="off"
        />
        <TextField
          label={t('register.pincode')}
          value={form.pincode}
          onChangeText={field('pincode')}
          error={errorFor('pincode')}
          keyboardType="number-pad"
          maxLength={6}
        />
        {choices ? (
          <>
            <ChoiceGroup
              label={t('register.level')}
              choices={choices.levels.map((level) => ({ value: level.id, label: levelLabel(t, level) }))}
              value={form.levelId}
              onChange={field('levelId')}
            />
            <ChoiceGroup<string>
              label={t('register.mentor')}
              choices={[
                ...choices.mentors.map((m) => ({ value: m.id, label: m.fullName })),
                // Empty string stands for "no mentor yet" inside the picker only.
                { value: '', label: t('register.noMentor') },
              ]}
              value={form.mentorId ?? ''}
              onChange={(id) => field('mentorId')(id || null)}
            />
          </>
        ) : (
          <AppText tone="muted">{t('common.loading')}</AppText>
        )}
      </Section>

      {minor ? (
        <Section title={t('register.guardianSection')} description={t('register.guardianIntro')}>
          <TextField
            label={t('register.guardianName')}
            value={form.guardianName}
            onChangeText={field('guardianName')}
            error={errorFor('guardianName')}
            autoComplete="off"
            autoCapitalize="words"
          />
          <TextField
            label={t('register.guardianPhone')}
            value={form.guardianPhone}
            onChangeText={field('guardianPhone')}
            error={errorFor('guardianPhone')}
            keyboardType="phone-pad"
            autoComplete="off"
          />
          <TextField
            label={t('register.guardianEmail')}
            value={form.guardianEmail}
            onChangeText={field('guardianEmail')}
            error={errorFor('guardianEmail')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
          />
          <ChoiceGroup
            label={t('register.relation')}
            choices={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
            value={form.relation}
            onChange={field('relation')}
            error={errorFor('relation')}
          />
          <ChoiceGroup
            label={t('register.idChecked')}
            choices={ID_TYPES.map((id) => ({ value: id, label: t(`idTypes.${id}`) }))}
            value={form.idType}
            onChange={field('idType')}
            error={errorFor('idType')}
          />
          <AppText variant="small" tone="muted">
            {t('register.idCheckedHint')}
          </AppText>
          <Checkbox
            label={t('register.photoConsent')}
            checked={form.photoConsent}
            onChange={field('photoConsent')}
          />
          <Checkbox
            label={t('register.writtenConsent')}
            checked={form.writtenConsent}
            onChange={field('writtenConsent')}
            error={errorFor('writtenConsent')}
          />
        </Section>
      ) : null}

      {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
      <Button label={t('register.submit')} onPress={save} loading={busy} disabled={!choices} />
    </Screen>
  );
}

/**
 * The level's name in the app's language. The three levels (Beginner, Intermediate, Advanced)
 * are created by migration 0001 and do not change, so they are translated by id; a level added
 * later shows its name from the database.
 */
function levelLabel(t: TFunction, level: LevelOption): string {
  switch (level.id) {
    case 1:
      return t('levels.1');
    case 2:
      return t('levels.2');
    case 3:
      return t('levels.3');
    default:
      return level.name;
  }
}
