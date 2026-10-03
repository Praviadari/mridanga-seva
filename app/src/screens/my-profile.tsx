// A3 Profile and app language, for everyone signed in: my name and phone (editable), my email
// and role (read-only), the language switch (the same picker as on the home screens) and Sign
// out. A student also sees their roll number and the way to My QR; the name on the roll is the
// coordinators' record and changes only through them. Shown by two routes: student/profile.tsx
// (from the ring on S1) and staff/profile.tsx (from "My profile" at the foot of the staff homes).
// Data: src/data/my-profile.ts; the check is in the database too (0013, docs/DECISIONS.md #44).

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DetailGrid } from '@/components/detail-grid';
import { LanguagePicker } from '@/components/language-picker';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { checkMyDetails, fetchMyPhone, NAME_MAX, saveMyDetails, type MyDetailsErrors } from '@/data/my-profile';
import { fetchMyStudent, type MyStudent } from '@/data/visits';

/** My profile. */
export function MyProfileScreen() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const myId = profile?.id ?? '';
  const isStudent = profile?.role === 'student';

  // undefined = loading; the phone is null when there is none.
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [student, setStudent] = useState<MyStudent | 'not_found' | null | undefined>(undefined);
  const [errors, setErrors] = useState<MyDetailsErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMyPhone(myId), isStudent ? fetchMyStudent(myId) : Promise.resolve(undefined)]).then(
      ([loadedPhone, me]) => {
        if (cancelled) return;
        setLoadFailed(loadedPhone === undefined);
        setPhone(loadedPhone ?? '');
        setStudent(me);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [myId, isStudent, attempt]);

  async function save() {
    const details = { fullName, phone: phone ?? '' };
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
    // The greeting on the home screens uses the name of the signed-in profile.
    await refreshProfile();
  }

  const roleName =
    profile?.role === 'guru' ? t('roles.guru') : profile?.role === 'coordinator' ? t('roles.coordinator') : t('roles.student');

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('myProfile.title') }} />

      <Section icon="person" title={t('myProfile.detailsTitle')}>
        {phone === undefined ? <LoadingCards /> : null}
        {loadFailed ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt((n) => n + 1)} />
          </>
        ) : null}
        {phone !== undefined && !loadFailed ? (
          <>
            <DetailGrid
              details={[
                { label: t('common.email'), value: profile?.email ?? '—' },
                { label: t('myProfile.role'), value: roleName },
              ]}
            />
            <TextField
              label={t('myProfile.nameLabel')}
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
              maxLength={NAME_MAX + 10}
              error={errors.fullName ? t(errors.fullName) : undefined}
            />
            <TextField
              label={t('myProfile.phoneLabel')}
              hint={t('myProfile.phoneHint')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              error={errors.phone ? t(errors.phone) : undefined}
            />
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Button icon="check" label={t('myProfile.save')} loading={saving} disabled={saving} onPress={() => void save()} />
          </>
        ) : null}
      </Section>

      {isStudent ? (
        <Section icon="qr" title={t('myProfile.rollTitle')}>
          {student && student !== 'not_found' ? (
            <>
              <DetailGrid
                details={[
                  { label: t('myProfile.rollNo'), value: student.rollNo },
                  { label: t('myProfile.rollName'), value: student.fullName },
                ]}
              />
              <AppText variant="small" tone="muted">
                {t('myProfile.rollNameHint')}
              </AppText>
            </>
          ) : null}
          {student === 'not_found' ? <AppText tone="muted">{t('myQr.noRecordBody')}</AppText> : null}
          <Button variant="secondary" icon="qr" label={t('myQr.open')} onPress={() => router.push('/student/my-qr')} />
        </Section>
      ) : null}

      <Section icon="language" title={t('common.language')}>
        <LanguagePicker />
      </Section>

      <Button variant="secondary" icon="signOut" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
