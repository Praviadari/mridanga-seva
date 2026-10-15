// A3 Profile and app language, for everyone signed in. Since #385 it opens with a card of who you are: initials,
// the name on the roll card, the roll number, the level and My QR for a student; the name, role and email for staff.
// Then the language switch (the same picker as on the home screens) and light or dark screens (#361); then the
// sign-in account (email, and the account's name, folded behind "Change my name"; staff also their phone); then About
// you, held instruments and Sign out, and the app version line (since the simple home, #240). The name on the roll is
// the coordinators' record and changes only through them; a student's phone is asked in About you (0036), not here.
// Shown by two routes: student/profile.tsx (from the ring on S1) and staff/profile.tsx (from "My profile" in the menu).
// Staff see the referral code they give to people they bring.
// Data: src/data/my-profile.ts; the check is in the database too (0013, docs/DECISIONS.md #44).

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AppearancePicker } from '@/components/appearance-picker';
import { Button } from '@/components/button';
import { DetailGrid } from '@/components/detail-grid';
import { HeldItemsPanel } from '@/components/held-items';
import { LanguagePicker } from '@/components/language-picker';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { PersonHeader } from '@/components/person-header';
import { PushNotice } from '@/components/push-notice';
import { Screen } from '@/components/screen';
import { SignOutButton } from '@/components/sign-out-button';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { VersionLine } from '@/components/update-notice';
import { fetchMyReferralCode } from '@/data/about';
import { checkMyDetails, fetchMyPhone, NAME_MAX, saveMyDetails, type MyDetailsErrors } from '@/data/my-profile';
import { fetchMyStudent, type MyStudent } from '@/data/visits';
import { typedPhone } from '@/lib/phone';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

/** My profile. */
export function MyProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const myId = profile?.id ?? '';
  const isStudent = profile?.role === 'student';

  // undefined = loading; staff only (a student's phone is in About you): '' when there is none.
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [student, setStudent] = useState<MyStudent | 'not_found' | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<MyDetailsErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const isStaff = profile?.role === 'guru' || profile?.role === 'coordinator';

  useEffect(() => {
    if (!isStaff || !myId) return;
    void fetchMyReferralCode(myId).then(setReferralCode);
  }, [isStaff, myId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([isStudent ? Promise.resolve('') : fetchMyPhone(myId), isStudent ? fetchMyStudent(myId) : Promise.resolve(undefined)]).then(
      ([loadedPhone, me]) => {
        if (cancelled) return;
        setLoadFailed(loadedPhone === undefined || me === null);
        setPhone(loadedPhone ?? '');
        setStudent(me);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [myId, isStudent, attempt]);

  async function save() {
    const details = isStudent ? { fullName } : { fullName, phone: phone ?? '' };
    const found = checkMyDetails(details);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setMessage(null);
    const outcome = await saveMyDetails(myId, details);
    setSaving(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('myProfile.saved') });
    setEditing(false);
    // The greeting on the home screens uses the name of the signed-in profile.
    await refreshProfile();
  }

  const roleName =
    profile?.role === 'guru' ? t('roles.guru') : profile?.role === 'coordinator' ? t('roles.coordinator') : t('roles.student');
  const accountName = profile?.full_name.trim() || '—';
  const loading = phone === undefined && !loadFailed;

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('myProfile.title') }} />

      {/* Who you are, first (#385): for a student the roll card's name, number and level, and the way to My QR. */}
      <View style={[styles.card, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
        {loading ? <LoadingCards rows={1} /> : null}
        {loadFailed ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt((n) => n + 1)} />
          </>
        ) : null}
        {!loading && !loadFailed && isStudent ? (
          student && student !== 'not_found' ? (
            <>
              <PersonHeader
                name={student.fullName}
                chips={{ levelId: student.levelId }}
                details={[t('myProfile.rollLine', { rollNo: student.rollNo })]}
              />
              <Button icon="qr" label={t('myQr.open')} onPress={() => router.push('/student/qr')} />
              <AppText variant="small" tone="muted">
                {t('myProfile.rollNameHint')}
              </AppText>
            </>
          ) : (
            <>
              <PersonHeader name={accountName} details={[roleName]} />
              <AppText tone="muted">{t('myQr.noRecordBody')}</AppText>
              <Button variant="secondary" icon="qr" label={t('myQr.open')} onPress={() => router.push('/student/qr')} />
            </>
          )
        ) : null}
        {!loading && !loadFailed && !isStudent ? <PersonHeader name={accountName} details={[roleName]} /> : null}
      </View>

      <Section icon="language" title={t('common.language')}>
        <LanguagePicker />
      </Section>

      {/* Light or dark screens on this phone (#361). */}
      <Section icon="appearance" title={t('myProfile.appearance')} description={t('myProfile.appearanceHint')}>
        <AppearancePicker />
      </Section>

      {/* The sign-in account, lower and folded (#385): its name is not the roll card's, which confused students. */}
      <Section
        icon="person"
        title={t('myProfile.accountTitle')}
        description={isStudent ? t('myProfile.accountHintStudent') : undefined}>
        <DetailGrid
          details={[
            { label: t('myProfile.accountName'), value: accountName },
            { label: t('common.email'), value: profile?.email ?? '—' },
          ]}
        />
        {editing ? (
          <>
            <TextField
              label={t('myProfile.nameLabel')}
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={NAME_MAX + 10}
              error={errors.fullName ? t(errors.fullName) : undefined}
            />
            {isStudent ? null : (
              <TextField
                label={t('myProfile.phoneLabel')}
                hint={t('myProfile.phoneHint')}
                value={phone ?? ''}
                // Digits only, + at the start for the country code (#267).
                onChangeText={(text) => setPhone(typedPhone(text))}
                keyboardType="phone-pad"
                inputMode="tel"
                maxLength={16}
                autoComplete="tel"
                textContentType="telephoneNumber"
                error={errors.phone ? t(errors.phone) : undefined}
              />
            )}
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Button icon="check" label={t('myProfile.save')} loading={saving} disabled={saving} onPress={() => void save()} />
          </>
        ) : (
          <>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Button
              variant="secondary"
              icon="edit"
              label={isStudent ? t('myProfile.editName') : t('myProfile.editDetails')}
              disabled={loading || loadFailed}
              onPress={() => {
                setFullName(profile?.full_name ?? '');
                setErrors({});
                setMessage(null);
                setEditing(true);
              }}
            />
          </>
        )}
      </Section>

      {isStudent ? (
        <Section icon="about" title={t('about.cardTitle')} description={t('about.profileHint')}>
          <Button variant="secondary" icon="about" label={t('about.cardEdit')} onPress={() => router.push('/student/about-you')} />
        </Section>
      ) : null}

      {referralCode ? (
        <Section icon="link" title={t('about.myCodeTitle')} description={t('about.myCodeHint')}>
          <AppText variant="title" family="sans" selectable accessibilityLabel={t('about.myCodeSpoken', { code: referralCode.split('').join(' ') })}>
            {referralCode}
          </AppText>
        </Section>
      ) : null}

      {/* Phase 2 slice 8 (C19): instruments I hold now. */}
      {myId ? <HeldItemsPanel by={isStudent ? 'mine' : { profileId: myId }} openable={!isStudent} /> : null}

      {/* Notifications refused or not set up on this phone (#305); nothing while they work. */}
      <PushNotice place="profile" />

      <SignOutButton icon="signOut" />
      {/* The version line, once at the foot of the homes (simple home, docs/DECISIONS.md #240). */}
      <VersionLine />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
});
