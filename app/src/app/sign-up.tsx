// A1 Create an account (step 1 of joining, under a minute; team MoM 05-10-2026, docs/DECISIONS.md
// #162; shortened by the world-class audit 22-10-2026 fix 9, #514): the full name as on the Aadhaar or another
// government ID (only the name is kept, never an ID number or a copy); email and password (one box, with the eye to
// show it: no second "confirm" box); date of birth (the phone's calendar, drop-downs on the web; under 18 → the
// parent's name, relation, email and mobile, and the parent consents by email: migration 0051, docs/DECISIONS.md
// #399); the centre only when the class has more than one (one centre is chosen by itself); the privacy-notice tick.
// The Diksha name, mobile number, gender and instruments moved to About you (src/screens/about-you.tsx), which opens
// once after the first sign-in; the desk's Accept needs only the name, date of birth and tick (0046-0048).
// A new login has no class access until the desk accepts it (it may practise while waiting: 0057, #510), or the
// database links it to a student record with the same email (docs/DATABASE.md "Linking a login to a student").
// The privacy notice is linked above the button with a required "I have read" tick; its version goes with the sign-up
// as notice_version (docs/DECISIONS.md #150, #268); the under-18 rule shows on the date of birth itself. Names take
// letters of any script only, each box is checked when it is left and again on Create, and Create takes the person
// to the first box with a problem (docs/DECISIONS.md #267, #268).

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import {
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  signUp,
  type MessageKey,
} from '@/auth/auth-actions';
import { AppText } from '@/components/app-text';
import { BirthDateField } from '@/components/birth-date-field';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { PhoneField } from '@/components/about-fields';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { useFormFocus } from '@/components/form-focus';
import { LanguagePicker } from '@/components/language-picker';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import {
  centreCities,
  centreCountries,
  centresIn,
  fetchSignUpChoices,
  type SignUpChoices,
} from '@/data/about';
import { checkParentDetails, type ParentField } from '@/data/minor-signup';
import { RELATIONS, type Relation } from '@/data/students';
import { birthCheck, birthDateOf, NO_BIRTH_PARTS, type BirthParts } from '@/lib/birth-date';
import { cleanName, nameError } from '@/lib/person-name';
import { countryName, isPhoneCountry, toE164, type CountryCode } from '@/lib/phone';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { spacing } from '@/theme/use-theme';

type Field = 'name' | 'email' | 'password' | 'dob' | ParentField | 'centre' | 'notice';
/** The fields in the order they are on the page: Create goes to the first one with a problem. */
const ORDER: readonly Field[] = ['name', 'email', 'password', 'dob', 'parentName', 'parentRelation', 'parentEmail',
  'parentPhone', 'centre', 'notice'];

/** Sign-up form. Shows "check your email" when Supabase needs the email confirmed first. */
export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  // The privacy notice ticked as read (audit S4-02): required; its version goes with the sign-up.
  const [noticeRead, setNoticeRead] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState<BirthParts>(NO_BIRTH_PARTS);
  // Under 18 (#399): the parent or guardian who gets the consent email.
  const [parentName, setParentName] = useState('');
  const [parentRelation, setParentRelation] = useState<Relation | null>(null);
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentPhoneCountryPicked, setParentPhoneCountry] = useState<CountryCode | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [centreId, setCentreId] = useState<number | null>(null);
  // undefined = loading, null = could not load, 'missing' = the database has no 0036 yet.
  const [choices, setChoices] = useState<SignUpChoices | 'missing' | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // A child's sign-up: the parent's address the consent email goes to once the child confirms (#399).
  const [sentParent, setSentParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { target, focusFirst, focusField } = useFormFocus<Field>();

  useEffect(() => {
    let cancelled = false;
    fetchSignUpChoices().then((result) => {
      if (cancelled) return;
      setChoices(result);
      // One country, one city, one centre: chosen already.
      if (result && result !== 'missing') {
        // The list is here now: "the centre list is needed" no longer applies.
        setFieldErrors((current) => (current.centre === 'signUp.choicesNeeded' ? { ...current, centre: undefined } : current));
        const countries = centreCountries(result.centres);
        if (countries.length === 1) setCountry(countries[0]);
        if (result.centres.length === 1) {
          setCity(result.centres[0].city ?? result.centres[0].name);
          setCentreId(result.centres[0].id);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const lists = choices && choices !== 'missing' ? choices : null;
  const ageCheck = birthCheck(birth);
  const centreCountry = lists?.centres.find((c) => c.id === centreId)?.countryCode ?? country;
  // The parent's mobile starts in the centre's country (India when none yet) until another is picked.
  const parentPhoneCountry: CountryCode = parentPhoneCountryPicked ?? (isPhoneCountry(centreCountry) ? centreCountry : 'IN');
  const minor = ageCheck === 'minor';
  const parentForm = {
    name: parentName,
    relation: parentRelation,
    email: parentEmail,
    phone: toE164(parentPhone, parentPhoneCountry),
    phoneTyped: parentPhone.trim() !== '',
  };

  /** Every problem of the form now; empty when it can be sent. */
  function problems(birthNow: BirthParts = birth): Partial<Record<Field, MessageKey>> {
    const errors: Partial<Record<Field, MessageKey>> = {};
    const nameProblem = nameError(name);
    if (nameProblem) errors.name = nameProblem;
    if (!isValidEmail(email)) errors.email = 'validation.emailInvalid';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = 'validation.passwordTooShort';
    const age = birthCheck(birthNow);
    if (age === 'missing') errors.dob = 'signUp.dobRequired';
    else if (age === 'invalid') errors.dob = 'signUp.dobInvalid';
    else if (age === 'minor') Object.assign(errors, checkParentDetails(parentForm, email));
    if (lists && lists.centres.length > 0 && !centreId) errors.centre = 'signUp.choose';
    // No centre list (still loading or failed): the account would get no centre (audit P1-05).
    if (choices === null || choices === undefined) errors.centre = 'signUp.choicesNeeded';
    if (!noticeRead) errors.notice = 'signUp.noticeRequired';
    return errors;
  }

  /**
   * Checks one box when it is left (#268): a problem shows at once, a fixed one goes away. An empty
   * box shows nothing until Create, unless it showed a problem already.
   */
  function checkOnLeave(key: Field, typed: string) {
    if (!typed.trim() && !fieldErrors[key]) return;
    const problem = problems()[key];
    setFieldErrors((current) => ({ ...current, [key]: problem }));
  }

  /** A new date of birth: its message follows the pick at once. */
  function pickBirth(parts: BirthParts) {
    setBirth(parts);
    if (fieldErrors.dob) setFieldErrors((current) => ({ ...current, dob: problems(parts).dob }));
  }

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    const errors = problems();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      setFormError('signUp.fixFields');
      focusFirst(ORDER, errors);
      return;
    }

    setBusy(true);
    // Only what joining needs (#514): the rest is asked in About you after the first sign-in.
    const result = await signUp(cleanName(name), email.trim(), password, {
      dob: birthDateOf(birth),
      centreId,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      parent:
        minor && parentRelation && parentForm.phone
          ? { name: cleanName(parentName), relation: parentRelation, email: parentEmail.trim().toLowerCase(), phone: parentForm.phone }
          : null,
    });
    setBusy(false);
    if (result.errorKey) setFormError(result.errorKey);
    else if (result.needsConfirmation) {
      setSentTo(email.trim());
      setSentParent(minor ? parentEmail.trim().toLowerCase() : null);
    }
    // Otherwise the person is signed in and the app moves on by itself.
  }

  if (sentTo) {
    return (
      <Screen header={<BrandHeader compact />}>
        <Notice tone="success" title={t('signUp.checkEmailTitle')}>
          {t('signUp.checkEmail', { email: sentTo })}
        </Notice>
        {/* The link opens the web version; the phone app needs its own sign-in after it (FLOW-05). */}
        {Platform.OS !== 'web' ? <AppText tone="muted">{t('common.linkOpensInBrowser')}</AppText> : null}
        {sentParent ? (
          <Notice tone="info" title={t('minorSignUp.checkEmailParentTitle')}>
            {t('minorSignUp.checkEmailParent', { email: sentParent })}
          </Notice>
        ) : null}
        <AppText tone="muted">{t(sentParent ? 'minorSignUp.nextStep' : 'signUp.nextStep')}</AppText>
        <Button label={t('forgotPassword.backToSignIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  const countries = lists ? centreCountries(lists.centres) : [];
  const cities = lists && country ? centreCities(lists.centres, country) : [];
  const centres = lists && country && city ? centresIn(lists.centres, country, city) : [];
  const fieldError = (key: Field) => fieldErrors[key] && t(fieldErrors[key]);

  return (
    <Screen centred header={<BrandHeader compact />}>
      <LanguagePicker />

      <Section title={t('signUp.title')} description={t('signUp.subtitle')}>
        <TextField kind="name"
          ref={target('name')}
          label={t('signUp.fullNameId')}
          hint={t('signUp.fullNameIdHint')}
          value={name}
          onChangeText={setName}
          onBlur={() => checkOnLeave('name', name)}
          error={fieldError('name')}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => focusField('email')}
          submitBehavior="submit"
          maxLength={80}
        />
        <TextField
          ref={target('email')}
          label={t('common.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => checkOnLeave('email', email)}
          error={fieldError('email')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="username"
          maxLength={254}
          returnKeyType="next"
          onSubmitEditing={() => focusField('password')}
          submitBehavior="submit"
        />
        <TextField
          ref={target('password')}
          label={t('common.password')}
          hint={t('signUp.passwordHint')}
          value={password}
          onChangeText={setPassword}
          error={fieldError('password')}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onBlur={() => checkOnLeave('password', password)}
          // One box, with the eye to see what was typed (#514); the date of birth below is a tap on the calendar.
          returnKeyType="next"
          onSubmitEditing={() => focusField('dob')}
          submitBehavior="submit"
        />
        <BirthDateField
          ref={target('dob')}
          label={t('signUp.dob')}
          value={birth}
          onChange={pickBirth}
          error={fieldError('dob')}
          hint={t(minor ? 'minorSignUp.dobHint' : 'signUp.dobHint')}
        />

        {/* Under 18 (#399): the parent or guardian, who gets one email with a code for the consent page. */}
        {minor ? (
          <View style={styles.group} role="group" accessibilityLabel={t('minorSignUp.parentTitle')}>
            <AppText variant="label">{t('minorSignUp.parentTitle')}</AppText>
            <AppText variant="small" tone="muted">{t('minorSignUp.parentIntro')}</AppText>
            <TextField
              ref={target('parentName')}
              label={t('minorSignUp.parentName')}
              value={parentName}
              onChangeText={setParentName}
              onBlur={() => checkOnLeave('parentName', parentName)}
              error={fieldError('parentName')}
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
            />
            <View ref={target('parentRelation')} collapsable={false}>
              <ChoiceGroup
                label={t('register.relation')}
                choices={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
                value={parentRelation}
                onChange={(r) => {
                  setParentRelation(r);
                  if (fieldErrors.parentRelation) setFieldErrors((current) => ({ ...current, parentRelation: undefined }));
                }}
                error={fieldError('parentRelation')}
              />
            </View>
            <TextField
              ref={target('parentEmail')}
              label={t('minorSignUp.parentEmail')}
              hint={t('minorSignUp.parentEmailHint')}
              value={parentEmail}
              onChangeText={setParentEmail}
              onBlur={() => checkOnLeave('parentEmail', parentEmail)}
              error={fieldError('parentEmail')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="email-address"
              inputMode="email"
              maxLength={254}
            />
            <PhoneField
              ref={target('parentPhone')}
              label={t('minorSignUp.parentPhone')}
              country={parentPhoneCountry}
              onCountry={setParentPhoneCountry}
              number={parentPhone}
              onNumber={setParentPhone}
              onBlur={() => checkOnLeave('parentPhone', parentPhone)}
              error={fieldError('parentPhone')}
            />
          </View>
        ) : null}

        {choices === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {choices === null ? (
          <View ref={target('centre')} collapsable={false} style={styles.group}>
            <Notice tone="error" title={t('signUp.choicesFailed')}>
              {fieldErrors.centre === 'signUp.choicesNeeded' ? t('signUp.choicesNeeded') : t('common.networkError')}
            </Notice>
            <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
          </View>
        ) : null}
        {/* One centre is chosen by itself (above); the choice shows only when the class has more (#514). */}
        {lists && lists.centres.length > 1 ? (
          <View ref={target('centre')} collapsable={false} style={styles.group}>
            {countries.length > 1 ? (
              <SelectField
                label={t('signUp.country')}
                options={countries.map((c) => ({ value: c, label: countryName(c, i18n.language) }))}
                value={country}
                onChange={(c) => {
                  setCountry(c);
                  const onlyCity = centreCities(lists.centres, c);
                  setCity(onlyCity.length === 1 ? onlyCity[0] : null);
                  const only = onlyCity.length === 1 ? centresIn(lists.centres, c, onlyCity[0]) : [];
                  setCentreId(only.length === 1 ? only[0].id : null);
                }}
              />
            ) : null}
            {country && cities.length > 1 ? (
              <SelectField
                label={t('signUp.city')}
                options={cities.map((c) => ({ value: c, label: c }))}
                value={city}
                onChange={(c) => {
                  setCity(c);
                  const only = centresIn(lists.centres, country, c);
                  setCentreId(only.length === 1 ? only[0].id : null);
                }}
              />
            ) : null}
            {centres.length > 0 ? (
              <ChoiceGroup
                label={t('signUp.centre')}
                choices={centres.map((c) => ({ value: c.id, label: c.name }))}
                value={centreId}
                onChange={setCentreId}
                error={fieldError('centre')}
              />
            ) : fieldErrors.centre ? (
              <AppText variant="small" tone="danger" role="alert">
                {t('signUp.chooseCentre')}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {/* Where the rest went: About you, after the first sign-in (#514); a child's parent consents first (#399). */}
        <AppText variant="small" tone="muted">{t(minor ? 'signUp.laterNoteMinor' : 'signUp.laterNote')}</AppText>

        {/* The notice next to its tick, above the button (audit S4-02; #150). */}
        <View ref={target('notice')} collapsable={false} style={styles.group}>
          <PrivacyNoticeLink label={t('signUp.privacyNotice')} />
          <Checkbox
            label={t('signUp.noticeRead')}
            checked={noticeRead}
            onChange={(on) => {
              setNoticeRead(on);
              if (on && fieldErrors.notice) setFieldErrors((current) => ({ ...current, notice: undefined }));
            }}
            error={fieldError('notice')}
          />
        </View>
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
        <Button label={t('signUp.submit')} onPress={submit} loading={busy} />
      </Section>
      <Button
        variant="link"
        label={t('signUp.haveAccount')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The same space between the centre's parts as between the other fields (Section's gap).
  group: {
    gap: spacing.md,
  },
});
