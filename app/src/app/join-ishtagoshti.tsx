// I14 Join Ishtagoshti (Phase 2 slice 7, docs/DECISIONS.md #88): a login without a class role joins the
// free sloka study. Year of birth (and, in the year one turns 18, the birthday question), optional
// phone, the notice and terms (PLACEHOLDER wording until the team gives it). Under 18: the parent's
// name, email and relation; the database emails the parent a 6-digit code, and reading opens when the
// code is typed here. Open from the pending screen (area 'pending', src/app/_layout.tsx); once the
// subscription is active the area becomes 'subscriber' and the app moves on by itself.
// Data: src/data/ig-subscribers.ts.

import { router, useFocusEffect } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { FormErrorSummary } from '@/components/form-error-summary';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  ageGroup,
  confirmParentCode,
  fetchMySubscription,
  joinIshtagoshti,
  sendParentCode,
  type MySubscription,
} from '@/data/ig-subscribers';
import { todayLocal } from '@/lib/dates';

type Field = 'year' | 'phone' | 'terms' | 'parentName' | 'parentEmail' | 'parentConsent';

/** I14: the join form, then (under 18) the parent's code. */
export default function JoinIshtagoshtiScreen() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  // undefined = loading, null = could not load.
  const [mine, setMine] = useState<MySubscription | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const state = await fetchMySubscription();
    setMine(state);
    if (state && state.state === 'active') await refreshProfile();
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/pending');
  }

  let body;
  if (mine === undefined) body = <LoadingCards />;
  else if (mine === null) {
    body = (
      <>
        <Notice tone="error" title={t('ishtagoshtiJoin.loadFailed')}>{t('common.networkError')}</Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </>
    );
  } else if (mine.state === 'blocked') {
    body = <Notice tone="error" title={t('ishtagoshtiJoin.blockedTitle')}>{t('ishtagoshtiJoin.blockedBody')}</Notice>;
  } else if (mine.state === 'awaiting_parent' && !editing) {
    body = <ParentCode mine={mine} onChanged={load} onEdit={() => setEditing(true)} />;
  } else if (mine.state === 'active') {
    body = <LoadingCards />;
  } else {
    body = (
      <JoinForm
        mine={mine}
        onJoined={async (state) => {
          setEditing(false);
          setMine(state);
          if (state.state === 'active') await refreshProfile();
        }}
      />
    );
  }

  return (
    <Screen header={<BrandHeader compact />}>
      <AppText variant="title">{t('ishtagoshtiJoin.title')}</AppText>
      <AppText tone="muted">{t('ishtagoshtiJoin.intro')}</AppText>
      {body}
      <Button variant="link" label={t('ishtagoshtiJoin.back')} onPress={back} />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

/** The details: year of birth, phone, terms; under 18 also the parent. */
function JoinForm({ mine, onJoined }: { mine: MySubscription; onJoined: (state: MySubscription) => Promise<void> }) {
  const { t } = useTranslation();
  const thisYear = Number(todayLocal().slice(0, 4));
  const [year, setYear] = useState(mine.birthYear ? String(mine.birthYear) : '');
  const [turned18, setTurned18] = useState(false);
  const [phone, setPhone] = useState(mine.phone ?? '');
  const [parentName, setParentName] = useState(mine.parentName ?? '');
  const [parentEmail, setParentEmail] = useState(mine.parentEmail ?? '');
  const [relation, setRelation] = useState(mine.parentRelation ?? '');
  const [terms, setTerms] = useState(false);
  const [parentConsent, setParentConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, ParseKeys>>>({});
  const [formError, setFormError] = useState<ParseKeys | null>(null);
  const [busy, setBusy] = useState(false);

  const yearNumber = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : null;
  const group = yearNumber ? ageGroup(yearNumber, thisYear) : null;
  const minor = group === 'minor' || (group === 'eighteen' && !turned18);

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    const found: Partial<Record<Field, ParseKeys>> = {};
    if (!yearNumber || yearNumber < thisYear - 120 || yearNumber > thisYear - 5) found.year = 'ishtagoshtiJoin.errors.birth_year_invalid';
    if (phone.trim() && !/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(phone.trim())) found.phone = 'ishtagoshtiJoin.errors.phone_invalid';
    if (!terms) found.terms = 'ishtagoshtiJoin.errors.terms_required';
    if (minor) {
      if (!parentName.trim()) found.parentName = 'ishtagoshtiJoin.errors.parent_name_invalid';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parentEmail.trim())) found.parentEmail = 'ishtagoshtiJoin.errors.parent_email_invalid';
      if (!parentConsent) found.parentConsent = 'ishtagoshtiJoin.errors.parent_consent_required';
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !yearNumber) return;
    setBusy(true);
    const result = await joinIshtagoshti({
      birthYear: yearNumber,
      turned18,
      phone,
      parentName: minor ? parentName : '',
      parentEmail: minor ? parentEmail : '',
      parentRelation: minor ? relation : '',
    });
    if ('errorKey' in result) {
      setBusy(false);
      setFormError(result.errorKey);
      return;
    }
    // A minor's first code goes out at once; the code screen can send it again.
    if (result.state === 'awaiting_parent') await sendParentCode();
    await onJoined(result);
    setBusy(false);
  }

  return (
    <>
      {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
      <Section icon="person" title={t('ishtagoshtiJoin.aboutYou')}>
        <TextField
          label={t('ishtagoshtiJoin.birthYear')}
          hint={t('ishtagoshtiJoin.birthYearHint')}
          value={year}
          onChangeText={setYear}
          error={errors.year && t(errors.year)}
          keyboardType="number-pad"
          maxLength={4}
        />
        {group === 'eighteen' ? (
          <Checkbox label={t('ishtagoshtiJoin.turned18')} checked={turned18} onChange={setTurned18} />
        ) : null}
        <TextField
          label={t('ishtagoshtiJoin.phone')}
          hint={t('ishtagoshtiJoin.phoneHint')}
          value={phone}
          onChangeText={setPhone}
          error={errors.phone && t(errors.phone)}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </Section>

      {minor ? (
        <Section icon="guardian" title={t('ishtagoshtiJoin.parentTitle')} description={t('ishtagoshtiJoin.parentHint')}>
          <TextField
            label={t('ishtagoshtiJoin.parentName')}
            value={parentName}
            onChangeText={setParentName}
            error={errors.parentName && t(errors.parentName)}
            autoComplete="off"
          />
          <TextField
            label={t('ishtagoshtiJoin.parentEmail')}
            value={parentEmail}
            onChangeText={setParentEmail}
            error={errors.parentEmail && t(errors.parentEmail)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="off"
          />
          <TextField label={t('ishtagoshtiJoin.parentRelation')} hint={t('ishtagoshtiJoin.parentRelationHint')} value={relation} onChangeText={setRelation} />
          <AppText tone="muted">{t('ishtagoshtiJoin.parentTerms')}</AppText>
          <Checkbox
            label={t('ishtagoshtiJoin.parentConsent')}
            checked={parentConsent}
            onChange={setParentConsent}
            error={errors.parentConsent && t(errors.parentConsent)}
          />
        </Section>
      ) : null}

      <Section icon="info" title={t('ishtagoshtiJoin.termsTitle')}>
        <AppText>{t('ishtagoshtiJoin.termsBody')}</AppText>
        <Checkbox label={t('ishtagoshtiJoin.termsAgree')} checked={terms} onChange={setTerms} error={errors.terms && t(errors.terms)} />
      </Section>

      <FormErrorSummary errors={errors} />
      <Button icon="ishtagoshti" label={minor ? t('ishtagoshtiJoin.submitMinor') : t('ishtagoshtiJoin.submit')} onPress={submit} loading={busy} />
    </>
  );
}

/** Under 18: the code sent to the parent, typed in here; send again; change the parent's details. */
function ParentCode({ mine, onChanged, onEdit }: { mine: MySubscription; onChanged: () => Promise<void>; onEdit: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; key: ParseKeys } | null>(null);
  const [busy, setBusy] = useState<'send' | 'confirm' | null>(null);

  async function send() {
    setBusy('send');
    const result = await sendParentCode();
    setBusy(null);
    if (typeof result === 'object') setMessage({ tone: 'error', key: result.errorKey });
    else if (result === 'not_set_up') setMessage({ tone: 'error', key: 'ishtagoshtiJoin.mailNotSetUp' });
    else {
      setMessage({ tone: 'success', key: 'ishtagoshtiJoin.codeSent' });
      await onChanged();
    }
  }

  async function confirm() {
    if (busy) return; // D6-17
    if (!/^\d{6}$/.test(code.trim())) {
      setMessage({ tone: 'error', key: 'ishtagoshtiJoin.codeFormat' });
      return;
    }
    setBusy('confirm');
    const result = await confirmParentCode(code);
    setBusy(null);
    if (typeof result === 'object') setMessage({ tone: 'error', key: result.errorKey });
    else if (result === 'confirmed') {
      setMessage({ tone: 'success', key: 'ishtagoshtiJoin.confirmed' });
      await onChanged();
    } else setMessage({ tone: 'error', key: `ishtagoshtiJoin.code_${result}` });
  }

  return (
    <Section icon="guardian" title={t('ishtagoshtiJoin.codeTitle')}>
      <AppText>
        {mine.codeSentAt
          ? t('ishtagoshtiJoin.codeSentTo', { name: mine.parentName ?? '', email: mine.parentEmail ?? '' })
          : t('ishtagoshtiJoin.codeNotSent', { name: mine.parentName ?? '', email: mine.parentEmail ?? '' })}
      </AppText>
      {message ? <Notice tone={message.tone}>{t(message.key)}</Notice> : null}
      <TextField
        label={t('ishtagoshtiJoin.codeLabel')}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="go"
        onSubmitEditing={confirm}
      />
      <Button icon="check" label={t('ishtagoshtiJoin.confirmCode')} onPress={confirm} loading={busy === 'confirm'} />
      <Button
        variant="secondary"
        icon="send"
        label={mine.codeSentAt ? t('ishtagoshtiJoin.sendAgain') : t('ishtagoshtiJoin.sendCode')}
        onPress={send}
        loading={busy === 'send'}
      />
      <Button variant="link" label={t('ishtagoshtiJoin.changeParent')} onPress={onEdit} />
    </Section>
  );
}
