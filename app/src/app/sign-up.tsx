// A1 Create an account (step 1 of joining, about a minute; team MoM 05-10-2026, docs/DECISIONS.md
// #162; team list 07-10-2026): the full name as on the Aadhaar or another government ID (only the
// name is kept, never an ID number or a copy) and, optional, the Diksha (initiated) name; email and
// password; date of birth (three drop-downs; under 18 → the class desk with a parent); gender; mobile
// number (E.164, the centre's country first); the centre (country → city → centre); the instruments
// the person wants to learn. A new login has no access
// until the database links it to a student record with the same email, or the Guru gives it a
// role (docs/DATABASE.md "Linking a login to a student"). Step 2, About you, follows the first
// sign-in (src/screens/about-you.tsx). The privacy notice is linked under the button (docs/DECISIONS.md
// #150); the under-18 rule shows on the date of birth itself.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, type TextInput } from 'react-native';

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
import { countryName, isPhoneCountry, toE164, type CountryCode } from '@/lib/phone';

type Field = 'name' | 'diksha' | 'email' | 'password' | 'confirm' | 'dob' | 'gender' | 'centre' | 'phone';

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
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSignUpChoices().then((result) => {
      if (cancelled) return;
      setChoices(result);
      // One country, one city, one centre: chosen already.
      if (result && result !== 'missing') {
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

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    const errors: Partial<Record<Field, MessageKey>> = {};
    if (!name.trim()) errors.name = 'validation.nameRequired';
    if (diksha.trim().length > 80) errors.diksha = 'about.errors.tooLong';
    if (!phone.trim()) errors.phone = 'signUp.phoneRequired';
    else if (!toE164(phone, phoneCountry)) errors.phone = 'about.errors.phoneInvalid';
    if (!isValidEmail(email)) errors.email = 'validation.emailInvalid';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = 'validation.passwordTooShort';
    else if (confirm !== password) errors.confirm = 'validation.passwordsDontMatch';
    if (ageCheck === 'missing') errors.dob = 'signUp.dobRequired';
    else if (ageCheck === 'invalid') errors.dob = 'signUp.dobInvalid';
    else if (ageCheck === 'minor') errors.dob = 'signUp.under18Desk';
    if (lists && lists.genders.length > 0 && !gender) errors.gender = 'signUp.choose';
    if (lists && lists.centres.length > 0 && !centreId) errors.centre = 'signUp.choose';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      setFormError('signUp.fixFields');
      return;
    }

    setBusy(true);
    const result = await signUp(name, email, password, {
      dob: birthDateOf(birth),
      gender,
      centreId,
      phone: toE164(phone, phoneCountry),
      dikshaName: diksha.trim() || null,
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
          label={t('signUp.fullNameId')}
          hint={t('signUp.fullNameIdHint')}
          value={name}
          onChangeText={setName}
          error={fieldError('name')}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
          maxLength={80}
        />
        <TextField
          label={t('about.dikshaName')}
          hint={t('about.dikshaHint')}
          value={diksha}
          onChangeText={setDiksha}
          error={fieldError('diksha')}
          autoComplete="off"
          autoCapitalize="words"
          maxLength={80}
        />
        <TextField
          ref={emailRef}
          label={t('common.email')}
          value={email}
          onChangeText={setEmail}
          error={fieldError('email')}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={passwordRef}
          label={t('common.password')}
          hint={t('signUp.passwordHint')}
          value={password}
          onChangeText={setPassword}
          error={fieldError('password')}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={confirmRef}
          label={t('signUp.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          error={fieldError('confirm')}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <BirthDateField
          label={t('signUp.dob')}
          value={birth}
          onChange={setBirth}
          error={fieldError('dob') ?? (ageCheck === 'minor' ? t('signUp.under18Desk') : undefined)}
          hint={t('signUp.dobHint')}
        />

        <PhoneField
          label={t('about.phone')}
          country={phoneCountry}
          onCountry={setPhoneCountry}
          number={phone}
          onNumber={setPhone}
          error={fieldError('phone')}
        />
        <AppText variant="small" tone="muted">{t('about.phonePurpose')}</AppText>

        {choices === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {choices === null ? (
          <Notice tone="error" title={t('signUp.choicesFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
        {choices === null ? (
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
        ) : null}
        {lists && lists.genders.length > 0 ? (
          <ChoiceGroup
            label={t('signUp.gender')}
            choices={lists.genders.map((g) => ({ value: g.code, label: optionLabel(g, i18n.language) }))}
            value={gender}
            onChange={setGender}
            error={fieldError('gender')}
          />
        ) : null}
        {lists && lists.genders.length > 0 ? (
          <AppText variant="small" tone="muted">{t('signUp.genderHint')}</AppText>
        ) : null}
        {lists && lists.centres.length > 0 ? (
          <>
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
          </>
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
