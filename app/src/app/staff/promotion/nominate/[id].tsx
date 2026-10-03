// C22 Nominate for promotion (Phase 2, slice 2), for a coordinator (the Guru may too); `id` is the
// student's id. The criteria check from the Guru's settings (whole syllabus of the level ticked,
// visits in the last weeks, an accepted level-up assessment), the reason, and the coordinators to
// ask for feedback (those who taught the student lately are ticked to start with). When a
// criterion is not met the coordinator may still nominate; the reason should say why, and the
// Guru sees the check. Data: src/data/promotion.ts (docs/DECISIONS.md #53).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { CriteriaList, levelStep } from '@/components/promotion-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { fetchNominateOptions, nominate, REASON_MAX, type NominateOptions } from '@/data/promotion';
import { formatDayMonthYear } from '@/lib/dates';

/** The C22 form. */
export default function NominateScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const { id: studentId } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = could not load.
  const [options, setOptions] = useState<NominateOptions | 'not_found' | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [ask, setAsk] = useState<Set<string> | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const loaded = await fetchNominateOptions(studentId, myId);
    setOptions(loaded);
    // Start with the coordinators who taught the student ticked, once.
    if (loaded && loaded !== 'not_found') {
      setAsk((current) => current ?? new Set(loaded.coordinators.filter((c) => c.taught).map((c) => c.id)));
    }
  }, [studentId, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('promotion.nominate.title') }} />;

  if (!options || options === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {options === undefined ? <LoadingCards /> : null}
        {options === 'not_found' ? <Notice tone="error">{t('promotion.errors.student_not_found')}</Notice> : null}
        {options === null ? (
          <>
            <Notice tone="error" title={t('promotion.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { student, criteria, coordinators } = options;
  const picked = ask ?? new Set<string>();
  const openId = criteria.openNominationId;

  // Cases where nominating is not possible: show why, and the way on.
  let blocked: string | null = null;
  if (criteria.nextLevelId === null) blocked = t('promotion.panel.topLevel');
  else if (openId !== null) blocked = t('promotion.panel.open');
  else if (criteria.renominateAfter) {
    blocked = t('promotion.panel.notYetUntil', { date: formatDayMonthYear(criteria.renominateAfter) });
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setAsk(next);
  }

  async function send() {
    const text = reason.trim();
    if (!text) {
      setReasonError(t('promotion.errors.reason_required'));
      return;
    }
    if (text.length > REASON_MAX) {
      setReasonError(t('promotion.errors.reason_too_long'));
      return;
    }
    setSaving(true);
    const result = await nominate(student.id, text, [...picked]);
    setSaving(false);
    if (result.errorKey || result.id === undefined) {
      setServerError(t(result.errorKey ?? 'common.genericError'));
      return;
    }
    router.replace({ pathname: '/staff/promotion/[id]', params: { id: String(result.id) } });
  }

  return (
    <Screen underHeader>
      {header}
      <Section
        icon="promote"
        title={student.fullName}
        description={[
          student.rollNo,
          criteria.nextLevelId !== null ? levelStep(t, criteria.levelId, criteria.nextLevelId) : null,
        ].filter(Boolean).join(' · ')}>
        <AppText variant="label">{t('promotion.nominate.criteria')}</AppText>
        <CriteriaList criteria={criteria} />
        {criteria.allOk ? (
          <Notice tone="success">{t('promotion.nominate.allMet')}</Notice>
        ) : criteria.nextLevelId !== null ? (
          <Notice tone="info">{t('promotion.nominate.notAllMet')}</Notice>
        ) : null}
      </Section>

      {blocked ? (
        <>
          <Notice tone="info">{blocked}</Notice>
          {openId !== null ? (
            <Button
              icon="promote"
              label={t('promotion.panel.openNomination')}
              onPress={() => router.replace({ pathname: '/staff/promotion/[id]', params: { id: String(openId) } })}
            />
          ) : null}
        </>
      ) : (
        <>
          <Section title={t('promotion.nominate.reasonTitle')}>
            <TextField
              label={t('promotion.nominate.reason')}
              hint={t('promotion.nominate.reasonHint')}
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                setReasonError(null);
                setServerError(null);
              }}
              maxLength={REASON_MAX}
              multiline
              style={styles.multiline}
              error={reasonError ?? undefined}
            />
          </Section>

          <Section title={t('promotion.nominate.askTitle')} description={t('promotion.nominate.askHint', { count: options.answersNeeded })}>
            {coordinators.length === 0 ? <AppText tone="muted">{t('promotion.nominate.noCoordinators')}</AppText> : null}
            {coordinators.map((c) => (
              <Checkbox
                key={c.id}
                label={c.taught ? t('promotion.nominate.taught', { name: c.fullName }) : c.fullName}
                checked={picked.has(c.id)}
                onChange={(on) => toggle(c.id, on)}
              />
            ))}
          </Section>

          {serverError ? <Notice tone="error">{serverError}</Notice> : null}
          <Button
            icon="send"
            label={picked.size > 0 ? t('promotion.nominate.send', { count: picked.size }) : t('promotion.nominate.sendAlone')}
            loading={saving}
            onPress={() => void send()}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
