// A1 Create an account (step 1 of joining, about a minute; team MoM 05-10-2026, docs/DECISIONS.md
// #162; team list 07-10-2026): the full name as on the Aadhaar or another government ID (only the
// name is kept, never an ID number or a copy) and, optional, the Diksha (initiated) name; email and
// password; date of birth (the phone's calendar, drop-downs on the web; under 18 → the class desk with a parent); gender; mobile
// number (E.164, the centre's country first); the centre (country → city → centre); the instruments
// the person wants to learn. A new login has no access
// until the database links it to a student record with the same email, or the Guru gives it a
// role (docs/DATABASE.md "Linking a login to a student"). Step 2, About you, follows the first
// sign-in (src/screens/about-you.tsx). The privacy notice is linked under the button (docs/DECISIONS.md
// #150); the under-18 rule shows on the date of birth itself. Names take letters of any script only, each box is
// checked when it is left and again on Create, and Create takes the person to the first box with a problem
// (docs/DECISIONS.md #267, #268).

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
import { InstrumentChecks, PhoneField } from '@/components/about-fields';
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
import { optionLabel } from '@/data/options';
import { birthCheck, birthDateOf, NO_BIRTH_PARTS, type BirthParts } from '@/lib/birth-date';
import { cleanName, nameError } from '@/lib/person-name';
import { countryName, isPhoneCountry, toE164, type CountryCode } from '@/lib/phone';
import { spacing } from '@/theme/use-theme';

type Field = 'name' | 'diksha' | 'email' | 'password' | 'confirm' | 'dob' | 'gender' | 'centre' | 'phone';
/** The fields in the order they are on the page: Create goes to the first one with a problem. */
const ORDER: readonly Field[] = ['name', 'diksha', 'email', 'password', 'confirm', 'dob', 'phone', 'gender', 'centre'];

/** Sign-up form. Shows "check your email" when Supabase needs the email confirmed first. */
export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [diksha, setDiksha] = useState('');
  const [phone, setPhone] = useState('');
  // Picked by the person; until then the country of the chosen centre (India when none yet).
  const [phoneCountryPicked, setPhoneCountry] = useState<CountryCode | null>(null);
  const [learn, setLearn] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [birth, setBirth] = useState<BirthParts>(NO_BIRTH_PARTS);
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [centreId, setCentreId] = useState<number | null>(null);
  // undefined = loading, null = could not load, 'missing' = the database has no 0036 yet.
  const [choices, setChoices] = useState<SignUpChoices | 'missing' | null | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
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
  const phoneCountry: CountryCode = phoneCountryPicked ?? (isPhoneCountry(centreCountry) ? centreCountry : 'IN');

  /** Every problem of the form now; empty when it can be sent. */
  function problems(birthNow: BirthParts = birth): Partial<Record<Field, MessageKey>> {
    const errors: Partial<Record<Field, MessageKey>> = {};
    const nameProblem = nameError(name);
    if (nameProblem) errors.name = nameProblem;
    const dikshaProblem = nameError(diksha, { required: false });
    if (dikshaProblem) errors.diksha = dikshaProblem;
    if (!phone.trim()) errors.phone = 'signUp.phoneRequired';
    else if (!toE164(phone, phoneCountry)) errors.phone = 'about.errors.phoneInvalid';
    if (!isValidEmail(email)) errors.email = 'validation.emailInvalid';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = 'validation.passwordTooShort';
    else if (confirm !== password) errors.confirm = 'validation.passwordsDontMatch';
    const age = birthCheck(birthNow);
    if (age === 'missing') errors.dob = 'signUp.dobRequired';
    else if (age === 'invalid') errors.dob = 'signUp.dobInvalid';
    else if (age === 'minor') errors.dob = 'signUp.under18Desk';
    if (lists && lists.genders.length > 0 && !gender) errors.gender = 'signUp.choose';
    if (lists && lists.centres.length > 0 && !centreId) errors.centre = 'signUp.choose';
    // No centre list (still loading or failed): the account would get no centre (audit P1-05).
    if (choices === null || choices === undefined) errors.centre = 'signUp.choicesNeeded';
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
    const result = await signUp(cleanName(name), email.trim(), password, {
      dob: birthDateOf(birth),
      gender,
      centreId,
      phone: toE164(phone, phoneCountry),
      dikshaName: cleanName(diksha) || null,
      learn,
    });
    setBusy(false);
    if (result.errorKey) setFormError(result.errorKey);
    else if (result.needsConfirmation) setSentTo(email.trim());
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
        <AppText tone="muted">{t('signUp.nextStep')}</AppText>
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
        <TextField
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
          onSubmitEditing={() => focusField('diksha')}
          submitBehavior="submit"
          maxLength={80}
        />
        <TextField
          ref={target('diksha')}
          label={t('about.dikshaName')}
          hint={t('about.dikshaHint')}
          value={diksha}
          onChangeText={setDiksha}
          onBlur={() => checkOnLeave('diksha', diksha)}
          error={fieldError('diksha')}
          autoComplete="off"
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
          returnKeyType="next"
          onSubmitEditing={() => focusField('confirm')}
          submitBehavior="submit"
        />
        <TextField
          ref={target('confirm')}
          label={t('signUp.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          onBlur={() => checkOnLeave('confirm', confirm)}
          error={fieldError('confirm')}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          // The date of birth is a tap on the calendar; Next goes on to the mobile number.
          returnKeyType="next"
          onSubmitEditing={() => focusField('phone')}
          submitBehavior="submit"
        />
        <BirthDateField
          ref={target('dob')}
          label={t('signUp.dob')}
          value={birth}
          onChange={pickBirth}
          error={fieldError('dob') ?? (ageCheck === 'minor' ? t('signUp.under18Desk') : undefined)}
          hint={t('signUp.dobHint')}
        />

        <PhoneField
          ref={target('phone')}
          label={t('about.phone')}
          country={phoneCountry}
          onCountry={setPhoneCountry}
          number={phone}
          onNumber={setPhone}
          onBlur={() => checkOnLeave('phone', phone)}
          error={fieldError('phone')}
          own
        />
        <AppText variant="small" tone="muted">{t('about.phonePurpose')}</AppText>

        {choices === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {choices === null ? (
          <View ref={target('centre')} collapsable={false} style={styles.group}>
            <Notice tone="error" title={t('signUp.choicesFailed')}>
              {fieldErrors.centre === 'signUp.choicesNeeded' ? t('signUp.choicesNeeded') : t('common.networkError')}
            </Notice>
            <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
          </View>
        ) : null}
        {lists && lists.genders.length > 0 ? (
          <View ref={target('gender')} collapsable={false}>
            <ChoiceGroup
              label={t('signUp.gender')}
              choices={lists.genders.map((g) => ({ value: g.code, label: optionLabel(g, i18n.language) }))}
              value={gender}
              onChange={setGender}
              error={fieldError('gender')}
            />
          </View>
        ) : null}
        {lists && lists.genders.length > 0 ? (
          <AppText variant="small" tone="muted">{t('signUp.genderHint')}</AppText>
        ) : null}
        {lists && lists.centres.length > 0 ? (
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

        {lists ? <InstrumentChecks options={lists.instruments} value={learn} onChange={setLearn} /> : null}

        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
        <Button label={t('signUp.submit')} onPress={submit} loading={busy} />
        <PrivacyNoticeLink label={t('signUp.privacyNotice')} />
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
