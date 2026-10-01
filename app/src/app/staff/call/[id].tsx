// C11 Call log, for coordinators and the Guru: phone a student who has stopped coming (or their
// parent, for a minor) and record what happened: the outcome, the reason, a comment (required)
// and, for "returning" or "paused", the date. Saving calls log_call, which also applies the
// outcome. This is the ONLY way a student becomes Paused or Left (docs/DECISIONS.md #4); Left
// asks once more before saving. Opened from the follow-up queue (C10) and the profile (C8).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  CALL_OUTCOMES,
  checkCallForm,
  EMPTY_CALL_FORM,
  fetchCallContext,
  logCall,
  outcomeNeedsDate,
  outcomeNeedsReason,
  type CallContext,
  type CallForm,
  type CallFormErrors,
} from '@/data/follow-up';
import { RELATIONS } from '@/data/students';
import { callReasonName, lastVisitText, outcomeName, statusName } from '@/i18n/labels';
import { dateInIndia, formatDayMonthYear, parseDayMonthYear, todayInIndia } from '@/lib/dates';

/** A phone number to dial: whose it is (already translated) and the number. */
type Dial = { who: string; phone: string };

/** Opens the phone's dialler with the number filled in. Nothing is dialled until the person taps Call. */
function dial(phone: string) {
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}

/** The student's summary, buttons to phone them, the last calls, and the call form. */
export default function CallLogScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = could not load, 'not_found' = no such student.
  const [context, setContext] = useState<CallContext | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<CallForm>(EMPTY_CALL_FORM);
  const [errors, setErrors] = useState<CallFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Discontinued" marks the student as Left: asked once more on the screen, because a pop-up
  // dialog does not work in the web version.
  const [confirmingLeft, setConfirmingLeft] = useState(false);
  const [saved, setSaved] = useState<CallForm | null>(null);

  const load = useCallback(async () => {
    setContext(await fetchCallContext(id));
  }, [id]);

  // Load again when the screen comes back into view, e.g. after the profile was opened from here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('callLog.title') }} />;

  if (context === undefined || context === null || context === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {context === undefined ? <LoadingCards /> : null}
        {context === 'not_found' ? <Notice tone="error">{t('profile.notFound')}</Notice> : null}
        {context === null ? (
          <>
            <Notice tone="error" title={t('callLog.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { studentId } = context;
  const openProfile = () => router.push({ pathname: '/staff/students/[id]', params: { id: studentId } });

  if (saved?.outcome) {
    const date = outcomeNeedsDate(saved.outcome) ? formatDayMonthYear(parseDayMonthYear(saved.nextDate) ?? '') : '';
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="success" title={t('callLog.savedTitle')}>
          {t(`callLog.saved.${saved.outcome}`, { name: context.fullName, date })}
        </Notice>
        <Button label={t('callLog.back')} onPress={() => router.back()} />
        <Button variant="secondary" label={t('callLog.openProfile')} onPress={openProfile} />
      </Screen>
    );
  }

  const update = (change: Partial<CallForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setConfirmingLeft(false);
    setServerError(null);
  };

  async function save() {
    const found = checkCallForm(form, todayInIndia());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (form.outcome === 'discontinued' && !confirmingLeft) {
      setConfirmingLeft(true);
      return;
    }
    setSaving(true);
    const result = await logCall(studentId, form);
    setSaving(false);
    setConfirmingLeft(false);
    if (result.errorKey) setServerError(t(result.errorKey));
    else setSaved(form);
  }

  const relationName = (code: string | null) =>
    code && (RELATIONS as readonly string[]).includes(code)
      ? t(`relations.${code as (typeof RELATIONS)[number]}`)
      : t('callLog.parent');
  const dials: Dial[] = [
    ...(context.phone ? [{ who: t('callLog.student'), phone: context.phone }] : []),
    ...context.guardians.flatMap((g) =>
      g.phone ? [{ who: `${relationName(g.relation)} (${g.fullName})`, phone: g.phone }] : [],
    ),
  ];

  return (
    <Screen underHeader>
      {header}
      <AppText variant="subtitle">{context.fullName}</AppText>
      <AppText tone="muted">{`${context.rollNo} · ${statusName(t, context.status)}`}</AppText>
      <AppText>
        {lastVisitText(t, {
          lastVisitAt: context.lastVisitAt,
          daysSinceVisit: context.daysSinceVisit,
          joinedOn: context.joinedOn,
          hereNow: false,
        })}
      </AppText>

      {dials.length === 0 ? <AppText tone="muted">{t('callLog.noPhone')}</AppText> : null}
      {dials.map((d) => (
        <Button
          key={`${d.who}-${d.phone}`}
          variant="secondary"
          label={t('callLog.dial', { who: d.who, phone: d.phone })}
          onPress={() => dial(d.phone)}
        />
      ))}

      {context.lastCalls.length > 0 ? (
        <Section title={t('callLog.lastCalls')}>
          {context.lastCalls.map((call) => (
            <AppText key={call.calledAt} tone="muted">
              {`${formatDayMonthYear(dateInIndia(call.calledAt))} · ${outcomeName(t, call.outcome)} · ${call.comment}`}
            </AppText>
          ))}
        </Section>
      ) : null}

      <Section title={t('callLog.formSection')}>
        <ChoiceGroup
          label={t('callLog.outcome')}
          choices={CALL_OUTCOMES.map((outcome) => ({ value: outcome, label: outcomeName(t, outcome) }))}
          value={form.outcome}
          onChange={(outcome) => update({ outcome })}
          error={errors.outcome ? t(errors.outcome) : undefined}
        />
        {form.outcome ? <AppText tone="muted">{t(`callLog.outcomeHelp.${form.outcome}`)}</AppText> : null}

        {form.outcome && outcomeNeedsReason(form.outcome) ? (
          <ChoiceGroup
            label={t('callLog.reason')}
            choices={context.reasons.map((code) => ({ value: code, label: callReasonName(t, code) }))}
            value={form.reason}
            onChange={(reason) => update({ reason })}
            error={errors.reason ? t(errors.reason) : undefined}
          />
        ) : null}

        {form.outcome && outcomeNeedsDate(form.outcome) ? (
          <TextField
            label={form.outcome === 'paused' ? t('callLog.pausedUntil') : t('callLog.returningOn')}
            hint={t('callLog.dateHint')}
            value={form.nextDate}
            onChangeText={(nextDate) => update({ nextDate })}
            error={errors.nextDate ? t(errors.nextDate) : undefined}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        ) : null}

        <TextField
          label={t('callLog.comment')}
          hint={t('callLog.commentHint')}
          value={form.comment}
          onChangeText={(comment) => update({ comment })}
          error={errors.comment ? t(errors.comment) : undefined}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
      </Section>

      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      {confirmingLeft ? (
        <Notice tone="info" title={t('callLog.confirmLeftTitle', { name: context.fullName })}>
          {t('callLog.confirmLeftBody')}
        </Notice>
      ) : null}
      <Button
        label={confirmingLeft ? t('callLog.confirmLeftYes') : t('callLog.save')}
        loading={saving}
        onPress={() => void save()}
      />
      {confirmingLeft ? (
        <Button variant="link" label={t('hereNow.cancel')} onPress={() => setConfirmingLeft(false)} />
      ) : null}
      <Button variant="link" label={t('callLog.openProfile')} onPress={openProfile} />
    </Screen>
  );
}
