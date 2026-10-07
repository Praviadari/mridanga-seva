// C8: what the student told in About you or the desk recorded (migration 0036, docs/DECISIONS.md #164):
// gender, emergency contact, how they found the class, occupation and service areas, with "Edit" to
// the staff form (staff/students/details/[id].tsx). Staff only (person_details is closed to students).
// Shows nothing on a database without 0036.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchReferrers, fetchStudentDetails, formatPhone, type Referrer, type StudentDetails } from '@/data/about';
import { fetchAllOptions, labelOf, OTHER, type OptionRow } from '@/data/options';

import { AppText } from './app-text';
import { Button } from './button';
import { DetailGrid } from './detail-grid';
import { Section } from './section';

type Loaded = { details: StudentDetails; rows: OptionRow[]; referrers: Referrer[] };

/** The details section of C8 for one student. */
export function StudentDetailsPanel({ studentId, minor }: { studentId: string; minor: boolean }) {
  const { t, i18n } = useTranslation();
  // undefined = loading, null = failed, 'missing' = no 0036.
  const [loaded, setLoaded] = useState<Loaded | 'missing' | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([fetchStudentDetails(studentId), fetchAllOptions(), fetchReferrers()]).then(([details, rows, referrers]) => {
        if (cancelled) return;
        if (details === 'missing') setLoaded('missing');
        else setLoaded(details && rows ? { details, rows, referrers: referrers ?? [] } : null);
      });
      return () => {
        cancelled = true;
      };
    }, [studentId]),
  );

  if (loaded === 'missing' || loaded === undefined) return null;
  if (loaded === null) {
    return (
      <Section icon="about" title={t('studentDetails.title')}>
        <AppText tone="muted">{t('studentDetails.loadFailed')}</AppText>
      </Section>
    );
  }

  const { details, rows, referrers } = loaded;
  // Labels of switched-off options too: an answer given before keeps its words.
  const all = { gender: rows.filter((r) => r.list === 'gender'), source: rows.filter((r) => r.list === 'source'),
    occupation: rows.filter((r) => r.list === 'occupation'), service_area: rows.filter((r) => r.list === 'service_area'),
    relation: rows.filter((r) => r.list === 'relation'), instrument: rows.filter((r) => r.list === 'instrument') };
  const lang = i18n.language;
  const none = t('profile.notGiven');
  const heard = details.heard_via === 'referral'
    ? t('studentDetails.referredBy', { name: referrers.find((r) => r.id === details.referred_by)?.fullName ?? t('profile.unknownPerson') })
    : details.heard_via === OTHER
      ? [labelOf(all.source, OTHER, lang), details.heard_other].filter(Boolean).join(': ')
      : labelOf(all.source, details.heard_via, lang);
  const occupation = details.occupation === OTHER
    ? [labelOf(all.occupation, OTHER, lang), details.occupation_other].filter(Boolean).join(': ')
    : labelOf(all.occupation, details.occupation, lang);
  const services = (details.service_areas ?? [])
    .map((code) => (code === OTHER && details.service_other ? `${labelOf(all.service_area, code, lang)}: ${details.service_other}` : labelOf(all.service_area, code, lang)))
    .join(', ');
  const emergency = details.emergency_name
    ? [details.emergency_name, labelOf(all.relation, details.emergency_relation, lang), formatPhone(details.emergency_phone)].filter(Boolean).join(' · ')
    : '';

  return (
    <Section icon="about" title={t('studentDetails.title')} description={t('studentDetails.staffOnly')}>
      <DetailGrid
        details={[
          { label: t('about.gender'), value: labelOf(all.gender, details.gender, lang) || none },
          { label: t('about.dikshaName'), value: details.diksha_name || none },
          { label: t('about.learn'), value: (details.learn_interests ?? []).map((c) => labelOf(all.instrument, c, lang)).join(', ') || none },
          ...(minor ? [] : [{ label: t('about.stepEmergency'), value: emergency || none }]),
          { label: t('about.heard'), value: heard || none },
          { label: t('about.occupation'), value: occupation || none },
          { label: t('about.services'), value: services || none },
        ]}
      />
      <Button
        variant="secondary"
        icon="edit"
        label={t('studentDetails.edit')}
        onPress={() => router.push({ pathname: '/staff/students/details/[id]', params: { id: studentId } })}
      />
    </Section>
  );
}
