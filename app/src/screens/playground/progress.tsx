// My Playground progress (docs/RHYTHM_PLAYGROUND.md §12.1, §12.4; docs/DECISIONS.md #735): one row per skill with its
// label word and icon (Exploring, Practising, Steady, Ready for Review — never a score), how many right of how many,
// the trend against two weeks before, and the last day practised. Recognition (games) and performance (timing on a
// tuned phone, or the facilitator's rating) are two blocks, never added together, under the line "Playing on your
// khol is checked by your facilitator in class." No points, no comparison with anyone, nothing "lost". Worked out on
// the phone from the rounds kept there and the saved ones (lib/playground/labels.ts), so it works offline too.

import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { formatDate } from '@/lib/dates';
import { topStep } from '@/lib/playground/generator';
import { labelRules, skillProgress } from '@/lib/playground/labels';
import type { SkillId, SkillProgress } from '@/lib/playground/types';
import { gameForSkill, labelView, progressBlocks, skillKey } from '@/lib/playground-games/catalogue';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { loadPlayground, type PlaygroundLoad } from './playground-data';

/** The screen. */
export function PlaygroundProgress() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [load, setLoad] = useState<PlaygroundLoad | null>(null);
  useEffect(() => {
    let live = true;
    void loadPlayground(profile?.id ?? '').then((loaded) => {
      if (live) setLoad(loaded);
    });
    return () => {
      live = false;
    };
  }, [profile?.id]);

  const rows = useMemo(() => {
    if (!load?.pack || !load.state) return null;
    const tops: Partial<Record<SkillId, number>> = {};
    for (const tpl of load.pack.templates) {
      if (tpl.levelMin <= load.state.levelId && tpl.levelMax >= load.state.levelId) tops[tpl.skill] = Math.max(tops[tpl.skill] ?? 0, topStep(tpl));
    }
    return skillProgress(load.rounds, labelRules(load.pack.labels), tops, load.at);
  }, [load]);
  const blocks = rows ? progressBlocks(rows) : null;

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('playground.progress.title') }} />
      <AppText tone="muted">{t('playground.progress.intro')}</AppText>
      {!load ? <LoadingCards /> : null}
      {load && !blocks ? <Notice tone="info">{t('playground.round.notReady')}</Notice> : null}
      {blocks ? (
        <>
          <Section icon="listen" title={t('playground.progress.recognition')}>
            {blocks.recognition.length === 0 ? <AppText tone="muted">{t('playground.progress.none')}</AppText> : null}
            {blocks.recognition.map((row) => (
              <SkillRow key={row.skill} row={row} />
            ))}
          </Section>
          <Section icon="drum" title={t('playground.progress.performance')}>
            <AppText>{t('playground.progress.khol')}</AppText>
            {blocks.performance.map((row) => (
              <SkillRow key={row.skill} row={row} />
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

/** One skill: its name, the label word with its icon, the numbers in words, and "Practise this". */
function SkillRow({ row }: { row: SkillProgress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = labelView(row.label);
  const key = skillKey(row.skill);
  const name = key ? t(key) : row.skill;
  const game = gameForSkill(row.skill);
  const route = game?.route ?? null;
  const lines = [
    row.kind === 'recognition' && row.correct !== null
      ? t('playground.progress.correct', { correct: row.correct, total: row.opportunities })
      : t('playground.progress.rounds', { count: row.opportunities }),
    row.trend ? t(`playground.progress.trend.${row.trend}`) : null,
    row.timingConfidence === 'calibrated' ? t('playground.progress.calibrated') : row.timingConfidence === 'not_calibrated' ? t('playground.progress.notCalibrated') : null,
    row.lastPractised ? t('playground.progress.last', { date: formatDate(row.lastPractised.slice(0, 10)) }) : null,
  ].filter((l): l is string => !!l);
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View accessible style={styles.rowText}>
        <AppText variant="label">{name}</AppText>
        <View style={[styles.label, { borderColor: colors.controlBorder }]}>
          <Icon name={label.icon} size={18} color={colors.text} />
          <AppText variant="label">{t(label.key)}</AppText>
        </View>
        {lines.map((line) => (
          <AppText key={line} variant="small" tone="muted">
            {line}
          </AppText>
        ))}
      </View>
      {route ? <Button variant="link" label={t('playground.progress.practise')} onPress={() => router.push(route)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
  rowText: { gap: 2 },
  label: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
