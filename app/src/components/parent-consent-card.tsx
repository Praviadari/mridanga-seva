// The waiting screen's card for a child who signed up at home (migration 0051, docs/DECISIONS.md #399): where the
// parent's consent stands and what the child can do. Waiting: the address the email went to (or that emails to
// parents are not switched on yet, or that it could not be sent), "Send the email again" and "Change my parent's
// details", and the day the sign-up is erased without consent (30 days). Consented: come to the desk with the
// parent's ID. No request (rare: an older sign-up): the parent's details, then the email goes. It asks again every
// 30 s while waiting, like the screen itself (#380).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { PhoneField } from '@/components/about-fields';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import type { MessageKey } from '@/data/errors';
import {
  checkParentDetails,
  fetchMyParentConsent,
  resendParentEmail,
  setParentDetails,
  type MyParentConsent,
  type ParentField,
} from '@/data/minor-signup';
import { RELATIONS, type Relation } from '@/data/students';
import { formatDateTime, formatTypedDate } from '@/lib/dates';
import { classLocale } from '@/lib/class-locale';
import { formatPhone, isPhoneCountry, splitE164, toE164, type CountryCode } from '@/lib/phone';
import { spacing } from '@/theme/use-theme';

/** How often the card asks again while the parent has not answered. */
const POLL_MS = 30_000;

/** Props for ParentConsentCard. */
export type ParentConsentCardProps = {
  /** The child's own sign-in email: the parent's may not be the same. */
  childEmail: string | undefined;
  /** Called after the state changed (the screen then reads the profile again). */
  onChanged: () => void;
};

/** Where the parent's consent stands, with what the child can do now. */
export function ParentConsentCard({ childEmail, onChanged }: ParentConsentCardProps) {
  const { t } = useTranslation();
  // undefined = loading or failed (nothing shown), null = not a child's sign-up.
  const [consent, setConsent] = useState<MyParentConsent | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchMyParentConsent().then((result) => {
        if (cancelled || result === undefined) return; // no internet: keep what is shown
        setConsent(result === 'missing' ? null : result);
      });
    load();
    const timer = setInterval(load, POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  // Consent given: the screen's steps move on (the profile carries the state). Once, when it changes.
  const consented = consent?.state === 'consented';
  const told = useRef(false);
  useEffect(() => {
    if (consented && !told.current) {
      told.current = true;
      onChanged();
    }
  }, [consented, onChanged]);

  if (!consent) return null;

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await resendParentEmail();
    setBusy(false);
    if (result.errorKey) setError(result.errorKey);
    else if (result.consent) {
      setConsent(result.consent);
      setNotice('minorSignUp.card.resent');
    }
  }

  if (consent.state === 'consented') {
    return (
      <Notice tone="success" title={t('minorSignUp.card.consentedTitle')}>
        {t('minorSignUp.card.consentedBody')}
      </Notice>
    );
  }

  if (consent.state === 'needs_parent' || editing) {
    return (
      <Section icon="guardian" title={t('minorSignUp.parentTitle')} description={t(consent.state === 'needs_parent'
        ? 'minorSignUp.card.needsParent' : 'minorSignUp.card.changeIntro')}>
        <ParentDetailsForm
          initial={consent}
          childEmail={childEmail ?? ''}
          onSaved={(saved) => {
            setConsent(saved);
            setEditing(false);
            setNotice('minorSignUp.card.resent');
            onChanged();
          }}
          onCancel={consent.state === 'needs_parent' ? undefined : () => setEditing(false)}
        />
      </Section>
    );
  }

  const mailLine =
    consent.mail === 'not_set_up'
      ? t('minorSignUp.card.mailNotSetUp')
      : consent.mail === 'failed'
        ? t('minorSignUp.card.mailFailed', { email: consent.parentEmail })
        : consent.mail === 'sent'
          ? t('minorSignUp.card.mailSent', { email: consent.parentEmail, when: consent.mailAt ? formatDateTime(consent.mailAt) : '' })
          : t('minorSignUp.card.mailWaiting', { email: consent.parentEmail });
  return (
    <Section icon="guardian" title={t('minorSignUp.card.waitingTitle')}>
      <AppText>{mailLine}</AppText>
      <AppText variant="small" tone="muted">
        {t('minorSignUp.card.waitingHint', { name: consent.parentName ?? '' })}
      </AppText>
      {consent.expiresAt ? (
        <AppText variant="small" tone="muted">
          {t('minorSignUp.card.expires', { date: formatTypedDate(consent.expiresAt.slice(0, 10)) })}
        </AppText>
      ) : null}
      {notice ? <Notice tone="success">{t(notice)}</Notice> : null}
      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      {consent.mail !== 'waiting' && consent.mailsLeft > 0 ? (
        <Button variant="secondary" icon="refresh" label={t('minorSignUp.card.resend')} loading={busy} onPress={() => void resend()} />
      ) : null}
      <Button variant="link" label={t('minorSignUp.card.change')} disabled={busy} onPress={() => setEditing(true)} />
    </Section>
  );
}

/** Props for ParentDetailsForm. */
type ParentDetailsFormProps = {
  initial: MyParentConsent;
  childEmail: string;
  onSaved: (consent: MyParentConsent) => void;
  /** Absent when there is nothing to go back to (no request yet). */
  onCancel?: () => void;
};

/** The parent's name, relation, email and mobile, saved with set_parent_details. */
function ParentDetailsForm({ initial, childEmail, onSaved, onCancel }: ParentDetailsFormProps) {
  const { t } = useTranslation();
  const split = splitE164(initial.parentPhone);
  const home = classLocale().country;
  const [name, setName] = useState(initial.parentName ?? '');
  const [relation, setRelation] = useState<Relation | null>(initial.parentRelation);
  const [email, setEmail] = useState(initial.parentEmail ?? '');
  const [phone, setPhone] = useState(split?.national ?? '');
  const [country, setCountry] = useState<CountryCode>(split?.country ?? (isPhoneCountry(home) ? home : 'IN'));
  const [errors, setErrors] = useState<Partial<Record<ParentField, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e164 = toE164(phone, country);
    const found = checkParentDetails({ name, relation, email, phone: e164, phoneTyped: phone.trim() !== '' }, childEmail);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !relation || !e164) {
      setFormError('signUp.fixFields');
      return;
    }
    setBusy(true);
    const result = await setParentDetails({ name, relation, email, phone: e164 });
    setBusy(false);
    if (result.errorKey) setFormError(result.errorKey);
    else if (result.consent) onSaved(result.consent);
  }

  const errorOf = (key: ParentField) => (errors[key] ? t(errors[key]) : undefined);
  return (
    <View style={styles.form}>
      <TextField
        label={t('minorSignUp.parentName')}
        value={name}
        onChangeText={setName}
        error={errorOf('parentName')}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
      />
      <ChoiceGroup
        label={t('register.relation')}
        choices={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
        value={relation}
        onChange={setRelation}
        error={errorOf('parentRelation')}
      />
      <TextField
        label={t('minorSignUp.parentEmail')}
        hint={t('minorSignUp.parentEmailHint')}
        value={email}
        onChangeText={setEmail}
        error={errorOf('parentEmail')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="email-address"
        inputMode="email"
        maxLength={254}
      />
      <PhoneField
        label={t('minorSignUp.parentPhone')}
        country={country}
        onCountry={setCountry}
        number={phone}
        onNumber={setPhone}
        error={errorOf('parentPhone')}
      />
      {initial.parentPhone ? (
        <AppText variant="small" tone="muted">
          {t('minorSignUp.card.before', { phone: formatPhone(initial.parentPhone), email: initial.parentEmail ?? '' })}
        </AppText>
      ) : null}
      {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
      <Button icon="send" label={t('minorSignUp.card.save')} loading={busy} onPress={() => void save()} />
      {onCancel ? <Button variant="link" label={t('register.cancel')} disabled={busy} onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
});
