// C2 Register a student, with C3 Guardian consent for students under 18.
// A coordinator (or the Guru) fills this in at the desk in about two minutes. When the date of
// birth shows the student is under 18, the parent-and-consent part appears and must be completed
// before anything is saved: a minor's details are never stored without consent
// (docs/DECISIONS.md #8, #16). Saving calls register_student (src/data/students.ts), which
// stores the student, guardian and consent together and gives the roll number. Saving the same
// form again after a lost answer returns the student saved the first time (docs/DECISIONS.md #126).
// Since 0036 (docs/DECISIONS.md #162-#165): the people who signed up and wait for the desk are listed at
// the top and fill the form in one tap (the coordinator checks the name against the ID and takes the
// photo); gender and the optional About-you details are asked here too; the mentor is chosen
// automatically (a coordinator of the same gender) unless the coordinator picks one.

import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageKey } from '@/auth/auth-actions';
import { EmergencyPart, HeardPart, OccupationPart, YouPart } from '@/components/about-fields';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ListRow } from '@/components/list-row';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { DATE_KEYBOARD, TextField } from '@/components/text-field';
import {
  aboutFormFrom,
  aboutPatch,
  checkAbout,
  emptyAboutForm,
  fetchReferrers,
  fetchWaitingSignUps,
  saveStudentDetails,
  type AboutErrors,
  type AboutForm,
  type AboutPart,
  type Referrer,
  type WaitingSignUp,
} from '@/data/about';
import { activeSets, fetchAllOptions, type OptionSets } from '@/data/options';
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
import { levelName } from '@/i18n/labels';
import { classLocale } from '@/lib/class-locale';
import { formatDateTime, formatTypedDate } from '@/lib/dates';

/** Longest name, area and email the form takes (FS2-09; the database's bounds are 120, 100, 254). */
const NAME_MAX_LENGTH = 100;
const AREA_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;

type Choices = { levels: LevelOption[]; mentors: MentorOption[] };
/** The 0036 parts: option lists, staff who bring people, sign-ups waiting. Null before 0036 or when not loaded. */
type Extras = { options: OptionSets; referrers: Referrer[]; waiting: WaitingSignUp[] };

/** Registration form, then a confirmation with the new roll number. */
export default function RegisterStudentScreen() {
  const { t } = useTranslation();
  // No mentor picked = a coordinator of the student's gender is given by the database (#165), once
  // the gender is known; a coordinator may still pick themselves or anyone else.
  const defaultMentor: string | null = null;

  // undefined = still loading, null = could not load.
  const [choices, setChoices] = useState<Choices | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [form, setForm] = useState<RegistrationForm>(() => emptyRegistration(defaultMentor));
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  // True when the database answered that this student is a minor although this phone's date says not (D6-13).
  const [serverMinor, setServerMinor] = useState(false);
  const [saved, setSaved] = useState<{ registered: Registered; name: string; detailsFailed: boolean } | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [about, setAbout] = useState<AboutForm>(() => emptyAboutForm(classLocale().country));
  const [aboutErrors, setAboutErrors] = useState<AboutErrors>({});
  // The sign-up the form was filled from: its centre goes on the record; it leaves the waiting list.
  const [fromSignUp, setFromSignUp] = useState<WaitingSignUp | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationChoices().then((result) => {
      if (!cancelled) setChoices(result);
    });
    // Asked apart: the form still works on a database without 0036 (then without these parts).
    void Promise.all([fetchAllOptions(), fetchReferrers(), fetchWaitingSignUps()]).then(([rows, referrers, waiting]) => {
      if (cancelled) return;
      setExtras(rows && rows.length > 0 ? { options: activeSets(rows), referrers: referrers ?? [], waiting: waiting ?? [] } : null);
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
  // The database's date decides in the end: when it answered "minor" the parent's part opens (D6-13).
  const minor = (age?.minor ?? false) || serverMinor;
  // A minor's emergency contact is the parent of the guardian part (C3).
  const aboutParts: AboutPart[] = minor ? ['you', 'heard', 'occupation'] : ['you', 'emergency', 'heard', 'occupation'];
  const aboutContext = { minor, hasGuardian: minor, staff: true };
  const setAboutField = <K extends keyof AboutForm>(key: K, value: AboutForm[K]) => setAbout((current) => ({ ...current, [key]: value }));
  const waiting = useMemo(() => (extras?.waiting ?? []).filter((w) => w.id !== fromSignUp?.id), [extras, fromSignUp]);

  /** Fills the form from a sign-up waiting for the desk. */
  function fillFrom(person: WaitingSignUp) {
    setForm((current) => ({
      ...current,
      fullName: person.full_name,
      dob: person.dob ? formatTypedDate(person.dob) : current.dob,
      email: person.email ?? current.email,
      phone: person.phone ?? current.phone,
    }));
    setAbout(aboutFormFrom(person, classLocale().country));
    setFromSignUp(person);
    setErrors({});
    setAboutErrors({});
  }

  async function save() {
    const found = { ...checkStudentDetails(form), ...(minor ? checkGuardianConsent(form) : {}) };
    const foundAbout = extras ? checkAbout(about, aboutParts, aboutContext) : {};
    setErrors(found);
    setAboutErrors(foundAbout);
    if (Object.keys(found).length > 0 || Object.keys(foundAbout).length > 0) {
      setFormError('register.errors.fixFields');
      return;
    }
    setFormError(null);
    setBusy(true);
    const result = await registerStudent(form, serverMinor);
    let detailsFailed = false;
    if (result.registered && extras && !result.registered.repeated) {
      // The details go after the record (#165: a gender set here gives the mentor). A failure here
      // keeps the student; C8 offers the details again.
      const patch = { ...aboutPatch(about, aboutParts, aboutContext), ...(fromSignUp?.centre_id ? { centre: fromSignUp.centre_id } : {}) };
      const details = await saveStudentDetails(result.registered.id, patch);
      detailsFailed = !!details.errorKey;
    }
    setBusy(false);
    if (result.registered) setSaved({ registered: result.registered, name: form.fullName.trim(), detailsFailed });
    else if (result.errorKey === 'register.errors.minorNeedsConsent' && !minor) {
      setServerMinor(true);
      setFormError('register.errors.minorByServer');
    } else setFormError(result.errorKey ?? 'common.genericError');
  }

  function registerAnother() {
    setForm(emptyRegistration(defaultMentor));
    setServerMinor(false);
    setAbout(emptyAboutForm(classLocale().country));
    setErrors({});
    setAboutErrors({});
    if (fromSignUp) setExtras((current) => (current ? { ...current, waiting: current.waiting.filter((w) => w.id !== fromSignUp.id) } : current));
    setFromSignUp(null);
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
        {saved.registered.repeated ? <AppText>{t('register.alreadySaved')}</AppText> : null}
        {saved.registered.linked ? <AppText>{t('register.linked')}</AppText> : null}
        {saved.detailsFailed ? <Notice tone="error">{t('register.detailsFailed')}</Notice> : null}
        <Button
          variant="secondary"
          icon="person"
          label={t('register.openStudent')}
          onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: saved.registered.id } })}
        />
        <Button icon="add" label={t('register.another')} onPress={registerAnother} />
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
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('register.intro')}</AppText>

      {waiting.length > 0 ? (
        <Section icon="newJoiner" title={t('register.waitingTitle', { count: waiting.length })} description={t('register.waitingHint')}>
          {waiting.slice(0, 10).map((w) => (
            <ListRow
              key={w.id}
              leading="person"
              title={w.full_name || w.email || ''}
              details={[w.email ?? '', t('register.signedUpOn', { when: formatDateTime(w.created_at) })].filter(Boolean)}
              action={{ label: t('register.fillFrom'), variant: 'secondary', onPress: () => fillFrom(w) }}
            />
          ))}
        </Section>
      ) : null}
      {fromSignUp ? (
        <Notice tone="info" title={t('register.filledTitle', { name: fromSignUp.full_name })}>
          {t('register.filledBody')}
        </Notice>
      ) : null}

      <Section icon="person" title={t('register.studentSection')}>
        <TextField
          label={t('register.fullName')}
          value={form.fullName}
          onChangeText={field('fullName')}
          error={errorFor('fullName')}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          hint={t('register.fullNameHint')}
        />
        <TextField
          label={t('register.dob')}
          value={form.dob}
          onChangeText={(dob) => {
            field('dob')(dob);
            setServerMinor(false);
          }}
          error={errorFor('dob')}
          // Once a real date is typed, the hint shows the age, so the coordinator sees at once
          // whether the parent's consent will be needed.
          hint={
            age
              ? t(age.minor ? 'register.ageMinor' : 'register.age', { age: age.age })
              : t('register.dobHint')
          }
          placeholder="15-06-2012"
          keyboardType={DATE_KEYBOARD}
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
          maxLength={EMAIL_MAX_LENGTH}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="off"
        />
        <TextField
          label={t('register.area')}
          hint={t('register.areaHint')}
          value={form.area}
          onChangeText={field('area')}
          maxLength={AREA_MAX_LENGTH}
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
              choices={choices.levels.map((level) => ({
                value: level.id,
                label: levelName(t, level.id, level.name),
              }))}
              value={form.levelId}
              onChange={field('levelId')}
            />
            {extras ? (
              <YouPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
            ) : null}
            <ChoiceGroup<string>
              label={t('register.mentor')}
              choices={[
                // Empty string stands for "no mentor yet" inside the picker only; since 0036 the database
                // then gives a coordinator of the student's gender (#165).
                { value: '', label: extras ? t('register.mentorAuto') : t('register.noMentor') },
                ...choices.mentors.map((m) => ({ value: m.id, label: m.fullName })),
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
        <Section icon="guardian" title={t('register.guardianSection')} description={t('register.guardianIntro')}>
          <TextField
            label={t('register.guardianName')}
            value={form.guardianName}
            onChangeText={field('guardianName')}
            error={errorFor('guardianName')}
            maxLength={NAME_MAX_LENGTH}
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
            maxLength={EMAIL_MAX_LENGTH}
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
          <PrivacyNoticeLink label={t('register.privacyNotice')} />
          <AppText variant="small" tone="muted">
            {t('register.privacyNoticeHint')}
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

      {extras ? (
        <Section icon="about" title={t('register.moreTitle')} description={t('register.moreHint')}>
          {minor ? null : (
            <>
              <AppText variant="label">{t('about.stepEmergency')}</AppText>
              <EmergencyPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
            </>
          )}
          <HeardPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext}
            referrers={extras.referrers} />
          <OccupationPart form={about} set={setAboutField} errors={aboutErrors} options={extras.options} context={aboutContext} />
        </Section>
      ) : null}

      {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
      <Button icon="register" label={t('register.submit')} onPress={save} loading={busy} disabled={!choices} />
    </Screen>
  );
}
