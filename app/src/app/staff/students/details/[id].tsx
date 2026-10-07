// C8 → Edit details (staff): a student's gender, emergency contact (adults; a minor's contact is the
// parent on record), how they found the class (the coordinator who brought them, or a source),
// occupation and service areas (migration 0036, docs/DECISIONS.md #164). Saving a gender gives a
// student without a mentor a coordinator of the same gender (#165). Every save is audited.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmergencyPart, HeardPart, OccupationPart, YouPart } from '@/components/about-fields';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  aboutFormFrom,
  aboutPatch,
  checkAbout,
  fetchReferrers,
  fetchStudentDetails,
  saveStudentDetails,
  type AboutErrors,
  type AboutForm,
  type AboutPart,
  type Referrer,
} from '@/data/about';
import { activeSets, fetchAllOptions, type OptionSets } from '@/data/options';
import { classLocale } from '@/lib/class-locale';
import { isMinorOn, todayLocal } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

type Loaded = { name: string; minor: boolean; options: OptionSets; referrers: Referrer[] };

/** The staff form for one student's details. */
export default function StudentDetailsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = failed, 'missing' = the database has no 0036 yet.
  const [loaded, setLoaded] = useState<Loaded | 'missing' | null | undefined>(undefined);
  const [form, setForm] = useState<AboutForm | null>(null);
  const [errors, setErrors] = useState<AboutErrors>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchStudentDetails(id),
      fetchAllOptions(),
      fetchReferrers(),
      supabase.from('students').select('full_name, dob').eq('id', id).maybeSingle(),
    ]).then(([details, rows, referrers, record]) => {
      if (cancelled) return;
      if (details === 'missing') {
        setLoaded('missing');
        return;
      }
      const student = record.data as { full_name: string; dob: string | null } | null;
      if (!details || !rows || !student) {
        setLoaded(null);
        return;
      }
      setLoaded({
        name: student.full_name,
        minor: !!student.dob && isMinorOn(student.dob, todayLocal()),
        options: activeSets(rows),
        referrers: referrers ?? [],
      });
      setForm(aboutFormFrom(details, classLocale().country));
    });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const header = <Stack.Screen options={{ title: t('studentDetails.editTitle') }} />;
  if (loaded === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (loaded === null || loaded === 'missing' || !form) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('studentDetails.loadFailed')}>
          {loaded === 'missing' ? t('about.notReady') : t('common.networkError')}
        </Notice>
        {loaded === null ? <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt(attempt + 1)} /> : null}
      </Screen>
    );
  }

  const context = { minor: loaded.minor, hasGuardian: loaded.minor, staff: true };
  const parts: AboutPart[] = loaded.minor ? ['you', 'heard', 'occupation'] : ['you', 'emergency', 'heard', 'occupation'];
  const set = <K extends keyof AboutForm>(key: K, value: AboutForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const partProps = { form, set, errors, options: loaded.options, context };

  async function save() {
    if (!form) return;
    const found = checkAbout(form, parts, context);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage({ tone: 'error', text: t('about.errors.fixFields') });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await saveStudentDetails(id, aboutPatch(form, parts, context));
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    if (router.canGoBack()) router.back();
    else setMessage({ tone: 'success', text: t('studentDetails.saved') });
  }

  return (
    <Screen underHeader>
      {header}
      <Section icon="person" title={loaded.name}>
        <YouPart {...partProps} />
      </Section>
      {loaded.minor ? null : (
        <Section icon="guardian" title={t('about.stepEmergency')}>
          <EmergencyPart {...partProps} />
        </Section>
      )}
      <Section icon="newJoiner" title={t('about.stepHeard')}>
        <HeardPart {...partProps} referrers={loaded.referrers} />
      </Section>
      <Section icon="about" title={t('about.stepOccupation')}>
        <OccupationPart {...partProps} />
      </Section>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button icon="check" label={t('studentDetails.save')} onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
