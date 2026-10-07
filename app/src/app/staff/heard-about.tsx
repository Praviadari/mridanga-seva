// G13 How students found us, the Guru only (team MoM 05-10-2026: "referred by — no → source dropdown for
// analysis"; migration 0036, docs/DECISIONS.md #166): for a range of dates, how many people answered
// "How did you hear about us?" (About you or the desk), counted by source and by the coordinator whose
// referral code they gave, each with how many of them are students now. Counted by heard_about_report.

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { fetchAllOptions, labelOf, type OptionRow } from '@/data/options';
import { rangeOf, type RangeChoice } from '@/data/reports';
import { formatDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

type Preset = Exclude<RangeChoice, 'custom'>;
type Count = { people: number; students: number };
type HeardReport = {
  people: number;
  answered: number;
  students: number;
  bySource: (Count & { code: string })[];
  byInterest: { code: string; people: number }[];
  byCoordinator: (Count & { id: string; name: string })[];
};

/** heard_about_report for the dates; null when it failed. */
async function fetchHeardReport(from: string, to: string): Promise<HeardReport | null> {
  const { data, error } = await supabase.rpc('heard_about_report', { p_from: from, p_to: to });
  if (error) return null;
  const raw = data as { people: number; answered: number; students: number; by_source: HeardReport['bySource'];
    by_coordinator: HeardReport['byCoordinator']; by_interest?: HeardReport['byInterest'] };
  return { people: raw.people, answered: raw.answered, students: raw.students, bySource: raw.by_source,
    byInterest: raw.by_interest ?? [], byCoordinator: raw.by_coordinator };
}

/** The report screen. */
export default function HeardAboutScreen() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [choice, setChoice] = useState<Preset>('last3Months');
  const [report, setReport] = useState<HeardReport | null | undefined>(undefined);
  const [sources, setSources] = useState<OptionRow[]>([]);
  const [attempt, setAttempt] = useState(0);
  const range = rangeOf(choice);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchHeardReport(range.from, range.to), fetchAllOptions()]).then(([loaded, rows]) => {
      if (cancelled) return;
      setReport(loaded);
      setSources((rows ?? []).filter((r) => r.list === 'source' || r.list === 'instrument'));
    });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, attempt]);

  if (profile?.role !== 'guru') return <GuruOnly title={t('heardReport.title')} />;
  const sourceName = (code: string) =>
    code === 'referral' ? t('about.referred') : labelOf(sources.filter((s) => s.list === 'source'), code, i18n.language);
  const line = (c: Count) => t('heardReport.line', { count: c.people, students: c.students });

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('heardReport.title') }} />
      <AppText tone="muted">{t('heardReport.intro')}</AppText>
      <ChoiceGroup
        chips
        label={t('heardReport.range')}
        choices={(['thisMonth', 'lastMonth', 'last4Weeks', 'last3Months'] as const).map((value) => ({
          value,
          label: t(`reports.ranges.${value}`),
        }))}
        value={choice}
        onChange={(next) => {
          setReport(undefined);
          setChoice(next);
        }}
      />
      <AppText variant="small" tone="muted">
        {t('heardReport.dates', { from: formatDate(range.from), to: formatDate(range.to) })}
      </AppText>

      {report === undefined ? <LoadingCards kind="tiles" /> : null}
      {report === null ? (
        <>
          <Notice tone="error" title={t('heardReport.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt(attempt + 1)} />
        </>
      ) : null}
      {report ? (
        <>
          <StatGrid>
            <StatTile icon="newJoiner" value={String(report.people)} label={t('heardReport.people')} />
            <StatTile icon="check" value={String(report.answered)} label={t('heardReport.answered')} />
            <StatTile icon="students" value={String(report.students)} label={t('heardReport.students')} />
          </StatGrid>
          <Section icon="report" title={t('heardReport.bySource')}>
            {report.bySource.length === 0 ? <EmptyState icon="report" title={t('heardReport.none')} /> : null}
            {report.bySource.map((row) => (
              <ListRow key={row.code} title={sourceName(row.code)} details={[line(row)]} />
            ))}
          </Section>
          <Section icon="instruments" title={t('heardReport.byInterest')}>
            {report.byInterest.length === 0 ? <EmptyState icon="instruments" title={t('heardReport.noneInterest')} /> : null}
            {report.byInterest.map((row) => (
              <ListRow key={row.code} title={labelOf(sources.filter((s) => s.list === 'instrument'), row.code, i18n.language)}
                details={[t('heardReport.interestLine', { count: row.people })]} />
            ))}
          </Section>
          <Section icon="groups" title={t('heardReport.byCoordinator')} description={t('heardReport.byCoordinatorHint')}>
            {report.byCoordinator.length === 0 ? <EmptyState icon="groups" title={t('heardReport.noneReferred')} /> : null}
            {report.byCoordinator.map((row) => (
              <ListRow key={row.id} leading="initials" title={row.name} details={[line(row)]} />
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
