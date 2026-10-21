// /parent-consent: the parent's consent page for a child who signed up at home (migration 0051, docs/DECISIONS.md #399).
// The email to the parent links here (on the web app; ?lang=te or hi picks the language) and carries a 6-digit code;
// the code is never in the link. Open to everyone, signed in or not (src/app/_layout.tsx). The page shows a short
// summary of the privacy notice with a link to the whole notice, then asks for the email the code went to, the code,
// the two declarations (I am the parent or legal guardian and 18 or over; I agree to the child's data being used as the
// notice says) and, separately and unticked, photos. give_parent_consent checks the code against its hash: 5 wrong
// tries end a code; a wrong code and an address with no request get the same answer. The child's name is shown only
// after the right code. The child's own login signed in on this device cannot consent (child_signed_in).

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isValidEmail } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { LanguagePicker } from '@/components/language-picker';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignOutButton } from '@/components/sign-out-button';
import { TextField } from '@/components/text-field';
import type { MessageKey } from '@/data/errors';
import { giveParentConsent, type ConsentResult } from '@/data/minor-signup';
import { asciiDigits } from '@/lib/digits';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { spacing } from '@/theme/use-theme';

/** The short notice summary, in order (parentConsent.summary.*). */
const SUMMARY = ['what', 'why', 'who', 'where', 'keep', 'rights'] as const;

/** What a refused answer says. */
const REFUSED: Partial<Record<ConsentResult, MessageKey>> = {
  wrong: 'parentConsent.wrong',
  too_many: 'parentConsent.tooMany',
  expired: 'parentConsent.expired',
  closed: 'parentConsent.closed',
  child_signed_in: 'parentConsent.childSignedIn',
};

/** The consent form, then the thank-you. */
export default function ParentConsentScreen() {
  const { t, i18n } = useTranslation();
  const { area } = useAuth();
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [parentOk, setParentOk] = useState(false);
  const [dataOk, setDataOk] = useState(false);
  const [photoOk, setPhotoOk] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'email' | 'code' | 'parentOk' | 'dataOk', MessageKey>>>({});
  const [refused, setRefused] = useState<ConsentResult | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<{ again: boolean; childName: string | null; photo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // The email's language (?lang=te or hi) for this visit only; the language picker still works.
  useEffect(() => {
    if (lang === 'en' || lang === 'te' || lang === 'hi') void i18n.changeLanguage(lang);
  }, [lang, i18n]);

  async function submit() {
    if (busy) return;
    const digits = asciiDigits(code).replace(/\D/g, '');
    const found: typeof errors = {};
    if (!isValidEmail(email)) found.email = 'validation.emailInvalid';
    if (digits.length !== 6) found.code = 'parentConsent.codeInvalid';
    if (!parentOk) found.parentOk = 'parentConsent.declarationRequired';
    if (!dataOk) found.dataOk = 'parentConsent.declarationRequired';
    setErrors(found);
    setRefused(null);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFormError('signUp.fixFields');
      return;
    }
    setBusy(true);
    const result = await giveParentConsent({ email, code: digits, parentOk, dataOk, photoOk, noticeVersion: PRIVACY_NOTICE_VERSION });
    setBusy(false);
    if (result.errorKey) setFormError(result.errorKey);
    else if (result.result === 'consented' || result.result === 'already') {
      setDone({ again: result.result === 'already', childName: result.childName ?? null, photo: result.photo ?? false });
    } else if (result.result === 'declaration_required') setFormError('parentConsent.declarationRequired');
    else setRefused(result.result ?? 'wrong');
  }

  if (done) {
    return (
      <Screen centred header={<BrandHeader compact />}>
        <Notice tone="success" title={t(done.again ? 'parentConsent.againTitle' : 'parentConsent.doneTitle')} announced>
          {t('parentConsent.doneBody', { name: done.childName ?? t('parentConsent.yourChild') })}
        </Notice>
        <AppText>{t(done.photo ? 'parentConsent.donePhotoYes' : 'parentConsent.donePhotoNo')}</AppText>
        <AppText>{t('parentConsent.doneDesk')}</AppText>
        <AppText tone="muted">{t('parentConsent.doneWithdraw')}</AppText>
      </Screen>
    );
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <LanguagePicker />
      <Section icon="guardian" title={t('parentConsent.title')}>
        <AppText>{t('parentConsent.intro')}</AppText>
        <View style={styles.summary}>
          <AppText variant="label">{t('parentConsent.summaryTitle')}</AppText>
          {SUMMARY.map((key) => (
            <AppText key={key} variant="small">
              {`• ${t(`parentConsent.summary.${key}`)}`}
            </AppText>
          ))}
        </View>
        <PrivacyNoticeLink label={t('parentConsent.fullNotice')} />

        <TextField
          label={t('parentConsent.email')}
          hint={t('parentConsent.emailHint')}
          value={email}
          onChangeText={setEmail}
          error={errors.email ? t(errors.email) : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          maxLength={254}
        />
        <TextField
          label={t('parentConsent.code')}
          hint={t('parentConsent.codeHint')}
          value={code}
          onChangeText={(text) => setCode(asciiDigits(text).replace(/\D/g, '').slice(0, 6))}
          error={errors.code ? t(errors.code) : undefined}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          // No maxLength: a pasted "123 456" would be cut before its space is taken out; onChangeText keeps 6 digits.
        />
        <Checkbox
          label={t('parentConsent.parentOk')}
          checked={parentOk}
          onChange={setParentOk}
          error={errors.parentOk ? t(errors.parentOk) : undefined}
        />
        <Checkbox
          label={t('parentConsent.dataOk')}
          checked={dataOk}
          onChange={setDataOk}
          error={errors.dataOk ? t(errors.dataOk) : undefined}
        />
        <Checkbox label={t('parentConsent.photoOk')} checked={photoOk} onChange={setPhotoOk} />
        <AppText variant="small" tone="muted">
          {t('parentConsent.photoHint')}
        </AppText>

        {refused && REFUSED[refused] ? <Notice tone="error">{t(REFUSED[refused])}</Notice> : null}
        {/* The child's own login is signed in here: the parent signs it out (or uses their own phone). */}
        {refused === 'child_signed_in' && area !== 'signedOut' ? <SignOutButton /> : null}
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
        <Button icon="check" label={t('parentConsent.submit')} onPress={() => void submit()} loading={busy} />
        <AppText variant="small" tone="muted">
          {t('parentConsent.notYou')}
        </AppText>
      </Section>
      {area === 'signedOut' ? <Button variant="link" label={t('parentConsent.toApp')} onPress={() => router.replace('/sign-in')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
  },
});
