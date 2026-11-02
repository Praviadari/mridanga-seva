// C27 Face scan use (Phase 3 P3-6, docs/DECISIONS.md #349): for staff, per centre, how many students use face
// scan and how many self-scans failed in a period, by reason (outside the area, mocked position, outside the
// open hours, integrity check — also by the rule that failed — liveness, no match ...). Counts only: no student
// is named and nobody is ranked, so nobody who said no to face scan is singled out (#213, Guru item 11). A
// coordinator sees their own centre, the Guru every centre (face_use_counts, 0070). Opened from Reports while
// face scan is switched on. Works on the web too (no camera involved).

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import type { MessageKey } from '@/data/errors';
import { FACE_FAILURE_REASONS, fetchFaceUseCounts, type FaceUseCounts } from '@/data/face';
import { rangeOf } from '@/data/reports';
import { formatDate } from '@/lib/dates';

type Period = 'last4Weeks' | 'thisMonth' | 'lastMonth' | 'last3Months';

/** The staff counts page. */
export default function FaceCountsScreen() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('last4Weeks');
  // undefined = loading.
  const [centres, setCentres] = useState<FaceUseCounts[] | undefined>(undefined);
  const [error, setError] = useState<MessageKey | null>(null);
  const range = rangeOf(period);

  const load = useCallback(async () => {
    const { from, to } = rangeOf(period);
    const result = await fetchFaceUseCounts(from, to);
    if ('errorKey' in result) {
      setError(result.errorKey);
      setCentres([]);
      return;
    }
    setError(null);
    setCentres(result.centres);
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('faceCounts.title') }} />
      <AppText tone="muted">{t('faceCounts.intro')}</AppText>
      <Section icon="visits" title={t('faceCounts.period')}>
        <ChoiceGroup
          chips
          accessibilityLabel={t('faceCounts.period')}
          choices={[
            { value: 'last4Weeks', label: t('reports.ranges.last4Weeks') },
            { value: 'thisMonth', label: t('reports.ranges.thisMonth') },
            { value: 'lastMonth', label: t('reports.ranges.lastMonth') },
            { value: 'last3Months', label: t('reports.ranges.last3Months') },
          ]}
          value={period}
          onChange={(next) => {
            setCentres(undefined);
            setPeriod(next);
          }}
        />
        <AppText tone="muted">{t('faceCounts.range', { from: formatDate(range.from), to: formatDate(range.to) })}</AppText>
      </Section>

      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      {centres === undefined ? <LoadingCards /> : null}
      {centres?.map((c) => <CentreCounts key={c.centreId} counts={c} />)}
    </Screen>
  );
}

/** One centre's numbers. */
function CentreCounts({ counts }: { counts: FaceUseCounts }) {
  const { t } = useTranslation();
  const failed = FACE_FAILURE_REASONS.reduce((sum, r) => sum + (counts.failures[r] ?? 0), 0);
  const rules = Object.entries(counts.integrity).sort((a, b) => b[1] - a[1]);
  return (
    <Section icon="face" title={counts.centre}>
      <StatGrid>
        <StatTile icon="face" value={String(counts.enrolled)} label={t('faceCounts.enrolled')} />
        <StatTile icon="alert" value={String(failed)} label={t('faceCounts.failed')} />
      </StatGrid>
      {failed === 0 ? <AppText tone="muted">{t('faceCounts.noFailures')}</AppText> : null}
      {FACE_FAILURE_REASONS.filter((r) => (counts.failures[r] ?? 0) > 0).map((r) => (
        <ListRow key={r} leading="alert" title={t(`faceCounts.reasons.${r}`)} details={[t('faceCounts.times', { count: counts.failures[r] ?? 0 })]} />
      ))}
      {rules.length > 0 ? (
        <>
          <AppText variant="subtitle">{t('faceCounts.integrityTitle')}</AppText>
          {rules.map(([rule, n]) => (
            <ListRow key={rule} leading="alert" title={rule} details={[t('faceCounts.times', { count: n })]} />
          ))}
        </>
      ) : null}
    </Section>
  );
}
