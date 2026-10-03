// Pieces of the promotion screens (Phase 2, slice 2; docs/DECISIONS.md #53): the criteria
// checklist (C8, C22, G7), a nomination's line on a list, the promotion block on the student
// profile (C8) and the card on the staff homes (G1: the level-up queue; C1: answers asked of me
// and my students ready to nominate). Data: src/data/promotion.ts.

import type { TFunction } from 'i18next';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  fetchCriteria,
  fetchPromotionHome,
  type Criteria,
  type NominationItem,
  type NominationStatus,
  type PromotionHome,
  type Rating,
} from '@/data/promotion';
import { levelName } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import { Notice } from './notice';
import { Section } from './section';
import { Chip } from './status-chip';

/** "Ready", "Almost", "Not yet". */
export function ratingName(t: TFunction, rating: Rating): string {
  return t(`promotion.rating.${rating}`);
}

/** "Open", "Promoted", "Not yet", "Withdrawn". */
export function nominationStatusName(t: TFunction, status: NominationStatus): string {
  return t(`promotion.status.${status}`);
}

/** "Beginner → Intermediate". */
export function levelStep(t: TFunction, from: number, to: number): string {
  return t('promotion.levelStep', { from: levelName(t, from), to: levelName(t, to) });
}

/** The chip colour of an answer. */
export const RATING_TONE = { ready: 'success', almost: 'warning', not_yet: 'danger' } as const;

/** The lines under a nomination on a list. */
export function nominationDetails(t: TFunction, item: NominationItem): string[] {
  const lines = [
    [levelStep(t, item.fromLevel, item.toLevel), item.rollNo].join(' · '),
    t('promotion.answersLine', {
      count: item.answers,
      needed: item.answersNeeded,
      ready: item.ready,
      almost: item.almost,
      notYet: item.notYet,
    }),
  ];
  if (item.status === 'open') {
    lines.push(t('promotion.nominatedLine', {
      date: formatDayMonthYear(item.nominatedAt.slice(0, 10)),
      name: item.nominatedByName ?? t('promotion.someone'),
    }));
  } else if (item.decidedAt) {
    lines.push(`${nominationStatusName(t, item.status)} · ${formatDayMonthYear(item.decidedAt.slice(0, 10))}`);
  }
  return lines;
}

/** One criterion: a tick or a cross, and what it says. */
function CriterionLine({ ok, text }: { ok: boolean; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.line} accessible accessibilityLabel={`${text}, ${ok ? '✓' : '✗'}`}>
      <Icon name={ok ? 'check' : 'alert'} color={ok ? colors.success : colors.danger} />
      <AppText style={styles.lineText}>{text}</AppText>
    </View>
  );
}

/** The criteria check as three lines, from the settings the Guru set. */
export function CriteriaList({ criteria }: { criteria: Criteria }) {
  const { t } = useTranslation();
  const lu = criteria.levelUp;
  return (
    <View style={styles.list}>
      <CriterionLine
        ok={criteria.syllabusOk}
        text={t(criteria.syllabusPercent >= 100 ? 'promotion.criteria.syllabusAll' : 'promotion.criteria.syllabusPart', {
          done: criteria.syllabusDone,
          total: criteria.syllabusTotal,
          percent: criteria.syllabusPercent,
        })}
      />
      <CriterionLine
        ok={criteria.visitsOk}
        text={t('promotion.criteria.visits', { count: criteria.visits, needed: criteria.visitsNeeded, weeks: criteria.visitWeeks })}
      />
      {criteria.levelUpNeeded || lu ? (
        <CriterionLine
          ok={criteria.levelUpOk}
          text={
            lu
              ? t('promotion.criteria.levelUpFound', {
                  title: lu.title,
                  score: lu.score ?? '-',
                  max: lu.scoreMax ?? '-',
                })
              : t('promotion.criteria.levelUpMissing')
          }
        />
      ) : null}
    </View>
  );
}

/**
 * C8: the promotion block of a student's profile: the criteria check, where a nomination stands,
 * and the button to nominate (C22) or to open the nomination.
 */
export function PromotionPanel({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [criteria, setCriteria] = useState<Criteria | null | undefined>(undefined);

  const load = useCallback(async () => {
    const result = await fetchCriteria(studentId);
    setCriteria(result.criteria ?? null);
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (criteria === undefined) return null;
  return (
    <Section
      icon="promote"
      title={t('promotion.panel.title')}
      description={
        criteria && criteria.nextLevelId !== null
          ? t('promotion.panel.toLevel', { level: levelName(t, criteria.nextLevelId) })
          : undefined
      }>
      {criteria === null ? <AppText tone="muted">{t('promotion.loadFailed')}</AppText> : null}
      {criteria && criteria.nextLevelId === null ? <AppText tone="muted">{t('promotion.panel.topLevel')}</AppText> : null}
      {criteria && criteria.nextLevelId !== null ? (
        <>
          <CriteriaList criteria={criteria} />
          {criteria.openNominationId !== null ? (
            <>
              <Notice tone="info">{t('promotion.panel.open')}</Notice>
              <Button
                variant="secondary"
                icon="promote"
                label={t('promotion.panel.openNomination')}
                onPress={() =>
                  router.push({ pathname: '/staff/promotion/[id]', params: { id: String(criteria.openNominationId) } })
                }
              />
            </>
          ) : criteria.renominateAfter ? (
            <Notice tone="info">
              {t('promotion.panel.notYetUntil', { date: formatDayMonthYear(criteria.renominateAfter) })}
            </Notice>
          ) : (
            <Button
              variant="secondary"
              icon="promote"
              label={t('promotion.panel.nominate')}
              onPress={() => router.push({ pathname: '/staff/promotion/nominate/[id]', params: { id: studentId } })}
            />
          )}
        </>
      ) : null}
    </Section>
  );
}

/**
 * The promotion card on a staff home. Guru (G1): the level-up queue, how many wait for a decision
 * and how many still collect answers. Coordinator (C1): answers asked of them and their students
 * ready to nominate. Hidden while loading or when it could not load (the home has its own notice).
 */
export function PromotionHomeCard({ guru }: { guru: boolean }) {
  const { t } = useTranslation();
  const [home, setHome] = useState<PromotionHome | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchPromotionHome().then(setHome);
    }, []),
  );

  if (!home) return null;
  const open = () => router.push('/staff/promotion');
  if (guru) {
    return (
      <Section icon="promote" title={t('promotion.home.guruTitle')} description={t('promotion.home.guruHint')}>
        <View style={styles.chips}>
          <Chip label={t('promotion.home.toDecide', { count: home.toDecide })} tone={home.toDecide > 0 ? 'warning' : 'neutral'} />
          <Chip label={t('promotion.home.collecting', { count: home.collecting })} tone="neutral" />
          <Chip label={t('promotion.home.ready', { count: home.ready })} tone="neutral" />
        </View>
        <Button
          variant={home.toDecide > 0 ? 'primary' : 'secondary'}
          icon="promote"
          label={t('promotion.home.openQueue')}
          onPress={open}
        />
      </Section>
    );
  }
  return (
    <Section icon="promote" title={t('promotion.home.coordinatorTitle')} description={t('promotion.home.coordinatorHint')}>
      <View style={styles.chips}>
        <Chip label={t('promotion.home.toAnswer', { count: home.toAnswer })} tone={home.toAnswer > 0 ? 'warning' : 'neutral'} />
        <Chip label={t('promotion.home.myReady', { count: home.ready })} tone={home.ready > 0 ? 'success' : 'neutral'} />
      </View>
      <Button variant="secondary" icon="promote" label={t('promotion.home.openList')} onPress={open} />
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  lineText: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
