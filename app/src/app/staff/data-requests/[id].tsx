// One data request, the Guru only (docs/DECISIONS.md #550-#556): who it is about (name, roll number, email; a child's
// record is marked: only a parent or guardian may have asked), what was asked, when, and the answer-by date. While it
// is open the Guru answers in words (done, with "I corrected the record" for a correction, or refused), or carries a
// withdrawal or an erasure out: the roll number (or, for a login without a record, its email) is typed to confirm,
// and a note is the answer and the reason. Withdrawal = withdraw_consent (the record frozen, the login off); erasure =
// erase_student or erase_login, whose tombstone keeps the request's reference. Everything is in the audit log.
// Data: src/data/data-rights.ts (0059).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { DetailGrid } from '@/components/detail-grid';
import { GuruOnly } from '@/components/guru-only';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  ACTION_NOTE_MAX,
  actionFor,
  actOnRequest,
  answerRequest,
  daysLeft,
  fetchRequest,
  REQUEST_TEXT_MAX,
  type ActionResult,
  type DataRequest,
} from '@/data/data-rights';
import { formatDate, formatDateTime, isMinorOn, todayLocal } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

/** One request, its answer and its action. */
export default function DataRequestScreen() {
  return (
    <RouteIdGuard kind="uuid">
      <DataRequestDetail />
    </RouteIdGuard>
  );
}

function DataRequestDetail() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = could not load.
  const [request, setRequest] = useState<DataRequest | 'not_found' | null | undefined>(undefined);
  const [answer, setAnswer] = useState('');
  const [corrected, setCorrected] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    setRequest(await fetchRequest(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('dataRequests.title')} />;

  async function sendAnswer(r: DataRequest, status: 'done' | 'refused') {
    setBusy(true);
    setMessage(null);
    const outcome = await answerRequest(r.id, status, answer, corrected);
    setBusy(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t(status === 'done' ? 'dataRequests.answered' : 'dataRequests.refused') });
    await load();
  }

  async function carryOut(r: DataRequest) {
    const action = actionFor(r.kind);
    if (!action) return;
    setBusy(true);
    setMessage(null);
    const outcome = await actOnRequest(r.id, action, confirm, note);
    setBusy(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: resultText(outcome.result) });
    setConfirm('');
    await load();
  }

  function resultText(result: ActionResult | undefined): string {
    if (!result) return t('dataRequests.done');
    const parts = [t('dataRequests.done')];
    if (result.consents_revoked !== undefined) parts.push(t('dataRequests.result.consents', { count: result.consents_revoked }));
    if (result.login_switched_off) parts.push(t('dataRequests.result.loginOff'));
    if (result.login_deleted !== undefined) parts.push(t(result.login_deleted ? 'dataRequests.result.loginDeleted' : 'dataRequests.result.loginLeft'));
    if (result.audit_rows_redacted !== undefined) parts.push(t('dataRequests.result.audit', { count: result.audit_rows_redacted }));
    if (result.files?.length) parts.push(t('dataRequests.result.files', { count: result.files.length }));
    return parts.join(' ');
  }

  const r = request && request !== 'not_found' ? request : null;
  const action = r ? actionFor(r.kind) : null;
  const minor = r?.person?.dob ? isMinorOn(r.person.dob, todayLocal()) : false;
  // What the Guru types to confirm an action: the roll number, or the email of a login without a record.
  const expected = r?.person?.rollNo ?? r?.person?.email ?? '';
  const left = r ? daysLeft(r.answerBy) : 0;

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: r ? r.ref : t('dataRequests.title') }} />
      {request === undefined ? <LoadingCards /> : null}
      {request === null ? (
        <>
          <Notice tone="error">{t('common.networkError')}</Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {request === 'not_found' ? <Notice tone="info">{t('dataRequests.notFound')}</Notice> : null}
      {r ? (
        <>
          <Section icon="audit" title={`${r.ref} · ${t(`dataRights.kinds.${r.kind}`)}`}>
            <DetailGrid
              details={[
                { label: t('dataRequests.fields.status'), value: t(`dataRights.statuses.${r.status}`) },
                { label: t('dataRequests.fields.person'), value: r.person?.name ?? t('dataRequests.personGone') },
                { label: t('dataRights.fields.rollNo'), value: r.person?.rollNo ?? '—' },
                { label: t('dataRights.fields.email'), value: r.person?.email ?? '—' },
                { label: t('dataRequests.fields.from'), value: t(`dataRequests.from.${r.source}`) },
                { label: t('dataRequests.fields.askedBy'), value: t(`dataRequests.askedBy.${r.askedBy}`) },
                { label: t('dataRequests.fields.made'), value: formatDateTime(r.createdAt) },
                {
                  label: t('dataRequests.fields.answerBy'),
                  value:
                    r.status === 'open' && left < 0
                      ? `${formatDate(r.answerBy.slice(0, 10))} · ${t('dataRequests.overdue', { count: -left })}`
                      : formatDate(r.answerBy.slice(0, 10)),
                },
                ...(r.closedAt ? [{ label: t('dataRequests.fields.closed'), value: formatDateTime(r.closedAt) }] : []),
              ]}
            />
            {minor ? <Notice tone="warning">{t('dataRequests.minorNote')}</Notice> : null}
            {r.field ? <AppText>{t('dataRequests.fieldLine', { field: r.field })}</AppText> : null}
            {r.body ? (
              <AppText selectable style={styles.quote}>
                {r.body}
              </AppText>
            ) : (
              <AppText tone="muted">{r.status === 'open' ? t('dataRequests.noText') : t('dataRequests.textGone')}</AppText>
            )}
            {r.answer ? <AppText>{t('dataRights.answerLine', { answer: r.answer })}</AppText> : null}
          </Section>

          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

          {r.status === 'open' && action ? (
            <Section icon="alert" title={t(`dataRequests.act.${action}.title`)} description={t(`dataRequests.act.${action}.what`)}>
              <TextField
                label={t('dataRequests.confirmLabel', { expected })}
                hint={r.person?.rollNo ? t('dataRequests.confirmHintRoll') : t('dataRequests.confirmHintEmail')}
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                required
              />
              <TextField
                label={t('dataRequests.noteLabel')}
                hint={t('dataRequests.noteHint')}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={ACTION_NOTE_MAX}
                counter={ACTION_NOTE_MAX}
                required
              />
              <Button
                icon={action === 'erase' ? 'delete' : 'cancel'}
                label={t(`dataRequests.act.${action}.button`)}
                loading={busy}
                disabled={busy || !expected || confirm.trim().toLowerCase() !== expected.toLowerCase() || !note.trim()}
                onPress={() => void carryOut(r)}
              />
            </Section>
          ) : null}

          {r.status === 'open' ? (
            <Section icon="reply" title={t(action ? 'dataRequests.refuseTitle' : 'dataRequests.answerTitle')} description={t('dataRequests.answerHint')}>
              <TextField
                label={t('dataRequests.answerLabel')}
                value={answer}
                onChangeText={setAnswer}
                multiline
                maxLength={REQUEST_TEXT_MAX}
                counter={REQUEST_TEXT_MAX}
                required
              />
              {r.kind === 'correction' ? <Checkbox label={t('dataRequests.corrected')} checked={corrected} onChange={setCorrected} /> : null}
              <View style={styles.buttons}>
                {action ? null : (
                  <Button icon="check" label={t('dataRequests.markDone')} loading={busy} disabled={busy} onPress={() => void sendAnswer(r, 'done')} />
                )}
                <Button variant="secondary" icon="close" label={t('dataRequests.refuse')} loading={busy} disabled={busy} onPress={() => void sendAnswer(r, 'refused')} />
              </View>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: {
    paddingLeft: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
