// My data and rights (audit 22-10-2026 fix 17, docs/DECISIONS.md #550-#556), from My profile, for students and for
// staff with their own login: (a) a summary of what the class holds about me, the services that handle it and the
// date of each consent, downloaded as JSON (the phone's share sheet, the browser's download) or printed on the web;
// (b-e) ask for a correction, an erasure, a withdrawal of the photo or data consent, name a nominee, or complain to
// the privacy contact. Each request is a row the Guru answers within 30 days (staff/data-requests); the person sees
// where it stands and may take an open one back. A child does not ask here: the parent or guardian asks at the desk
// or by email (Rule 10), and the screen says so. The Guru answers requests and does not file them here.
// Shown by two routes: student/my-data.tsx and staff/my-data.tsx. Data: src/data/data-rights.ts (0059).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { DetailGrid } from '@/components/detail-grid';
import { Fold } from '@/components/fold';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { TextField } from '@/components/text-field';
import {
  ANSWER_DAYS,
  cancelRequest,
  checkRequestForm,
  fetchMyDataSummary,
  fetchMyRequests,
  FILE_KINDS,
  fileRequest,
  hasConsent,
  PRIVACY_CONTACT,
  REQUEST_FIELD_MAX,
  REQUEST_TEXT_MAX,
  summaryFileName,
  summaryJson,
  type DataRequest,
  type MyDataSummary,
  type RequestForm,
  type RequestFormErrors,
  type RequestKind,
} from '@/data/data-rights';
import type { OptionSets } from '@/data/options';
import { fetchMyAbout } from '@/data/about';
import { CAN_PRINT, printPage, saveJsonFile } from '@/lib/data-export';
import { formatDate, formatDateTime } from '@/lib/dates';
import { myDataPageHtml, PRINT_CSS, summarySections } from '@/lib/my-data-page';
import { spacing } from '@/theme/use-theme';

type Loaded = { summary: MyDataSummary; requests: DataRequest[]; options: OptionSets | null };
const EMPTY_FORM: RequestForm = { kind: null, field: '', body: '' };

/** My data and rights. */
export function MyDataRightsScreen() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | 'not_set_up' | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const load = useCallback(async () => {
    // my_about's option lists turn About you's codes into labels; without them (staff) the codes show.
    const [summary, requests, about] = await Promise.all([fetchMyDataSummary(), fetchMyRequests(myId), fetchMyAbout()]);
    if (summary === 'not_set_up' || requests === 'not_set_up') setLoaded('not_set_up');
    else setLoaded(summary && requests ? { summary, requests, options: about && about !== 'missing' ? about.options : null } : null);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const summary = loaded && loaded !== 'not_set_up' ? loaded.summary : null;
  const options = loaded && loaded !== 'not_set_up' ? loaded.options : null;
  const sections = useMemo(
    () =>
      summary
        ? summarySections(t, summary, { date: formatDate, dateTime: formatDateTime }, options ? { sets: options, language: i18n.language } : undefined)
        : [],
    [summary, options, t, i18n.language],
  );

  // The kinds this person may ask for: a photo withdrawal only with a photo consent, a data withdrawal only with a record.
  const kinds = summary
    ? FILE_KINDS.filter((k) => (k === 'withdraw_photo' ? hasConsent(summary, 'photo') : k === 'withdraw_data' ? summary.record !== null : true))
    : [];

  async function download() {
    if (!summary) return;
    setExportNote(null);
    const outcome = await saveJsonFile(summaryFileName(summary, 'json'), summaryJson(summary), t('dataRights.downloadJson'));
    if (outcome === 'failed') setExportNote(t('dataRights.exportFailed'));
  }

  function print() {
    if (!summary) return;
    const html = myDataPageHtml(
      t('dataRights.pageHeading'),
      [t('dataRights.generatedAt', { time: formatDateTime(summary.generated_at) }), t('dataRights.pageIntro')],
      sections,
      [t('dataRights.contactLine', PRIVACY_CONTACT), t('dataRights.replyLine', { days: ANSWER_DAYS }), t('dataRights.boardLine')],
    );
    printPage(html, PRINT_CSS);
  }

  async function send() {
    const found = checkRequestForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSending(true);
    setMessage(null);
    const outcome = await fileRequest(form);
    setSending(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('dataRights.sent', { ref: outcome.ref, date: formatDate((outcome.answerBy ?? '').slice(0, 10)) }) });
    setForm(EMPTY_FORM);
    await load();
  }

  async function cancel(request: DataRequest) {
    setSending(true);
    const outcome = await cancelRequest(request.id);
    setSending(false);
    setAsking(null);
    setMessage(outcome.errorKey ? { tone: 'error', text: t(outcome.errorKey) } : null);
    await load();
  }

  const setKind = (kind: RequestKind) => {
    setForm((f) => ({ ...f, kind }));
    setErrors({});
    setMessage(null);
  };

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('dataRights.title') }} />
      <ScreenIntro text={t('dataRights.intro')} />
      {loaded === undefined ? <LoadingCards /> : null}
      {loaded === null ? (
        <>
          <Notice tone="error">{t('common.networkError')}</Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {loaded === 'not_set_up' ? <Notice tone="info">{t('dataRights.notSetUp')}</Notice> : null}

      {summary ? (
        <>
          {/* (a) the summary, with the download and (web) the printable page. */}
          <Section
            icon="report"
            title={t('dataRights.summaryTitle')}
            description={t('dataRights.generatedAt', { time: formatDateTime(summary.generated_at) })}>
            <View style={styles.buttons}>
              <Button variant="secondary" icon="download" label={t('dataRights.downloadJson')} onPress={() => void download()} />
              {CAN_PRINT ? <Button variant="secondary" icon="print" label={t('dataRights.print')} onPress={print} /> : null}
            </View>
            {CAN_PRINT ? null : (
              <AppText variant="small" tone="muted">
                {t('dataRights.printOnWeb')}
              </AppText>
            )}
            {exportNote ? <Notice tone="error">{exportNote}</Notice> : null}
          </Section>
          <Fold icon="lists" title={t('dataRights.showSummary')} open={showAll} onToggle={setShowAll}>
            {sections.map((s) => (
              <View key={s.key} style={styles.block}>
                <AppText variant="subtitle" accessibilityRole="header">
                  {s.title}
                </AppText>
                {s.key === 'processors' ? (
                  <AppText variant="small" tone="muted">
                    {t('dataRights.processorsHint')}
                  </AppText>
                ) : null}
                <DetailGrid details={s.rows} />
              </View>
            ))}
          </Fold>

          {/* (b-e) asking: not for a child (the parent asks), not for the Guru (who answers). */}
          {summary.minor ? (
            <Notice tone="info" title={t('dataRights.minorTitle')}>
              {t('dataRights.minorBody', { email: PRIVACY_CONTACT.email })}
            </Notice>
          ) : isGuru ? (
            <Section icon="audit" title={t('dataRights.guruTitle')} description={t('dataRights.guruHint')}>
              <Button icon="todo" label={t('dataRequests.open')} onPress={() => router.push('/staff/data-requests')} />
            </Section>
          ) : (
            <Section icon="send" title={t('dataRights.askTitle')} description={t('dataRights.askHint', { days: ANSWER_DAYS })}>
              <ChoiceGroup
                label={t('dataRights.kindLabel')}
                chips
                choices={kinds.map((k) => ({ value: k, label: t(`dataRights.kinds.${k}`) }))}
                value={form.kind}
                onChange={setKind}
                error={errors.kind ? t(errors.kind) : undefined}
              />
              {form.kind ? <Notice tone={form.kind === 'erasure' || form.kind === 'withdraw_data' ? 'warning' : 'info'}>{t(`dataRights.what.${form.kind}`)}</Notice> : null}
              {form.kind === 'correction' ? (
                <TextField
                  label={t('dataRights.fieldLabel')}
                  hint={t('dataRights.fieldHint')}
                  value={form.field}
                  onChangeText={(field) => setForm((f) => ({ ...f, field }))}
                  maxLength={REQUEST_FIELD_MAX}
                  required
                  error={errors.field ? t(errors.field, { max: REQUEST_FIELD_MAX }) : undefined}
                />
              ) : null}
              {form.kind ? (
                <TextField
                  label={t(`dataRights.bodyLabel.${form.kind === 'correction' || form.kind === 'grievance' || form.kind === 'nominate' ? form.kind : 'other'}`)}
                  value={form.body}
                  onChangeText={(body) => setForm((f) => ({ ...f, body }))}
                  multiline
                  maxLength={REQUEST_TEXT_MAX}
                  counter={REQUEST_TEXT_MAX}
                  required={form.kind === 'correction' || form.kind === 'grievance' || form.kind === 'nominate'}
                  error={errors.body ? t(errors.body, { max: REQUEST_TEXT_MAX }) : undefined}
                />
              ) : null}
              {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
              {form.kind ? (
                <Button icon="send" label={t('dataRights.send')} loading={sending} disabled={sending} onPress={() => void send()} />
              ) : null}
            </Section>
          )}

          {/* Where my requests stand. */}
          {loaded && loaded !== 'not_set_up' && loaded.requests.length > 0 ? (
            <Section icon="lists" title={t('dataRights.myRequests')}>
              {loaded.requests.map((r) => (
                <View key={r.id} style={styles.request}>
                  <View style={styles.chips}>
                    <Chip label={t(`dataRights.statuses.${r.status}`)} tone={statusTone(r.status)} />
                    <AppText variant="small" tone="muted">
                      {`${r.ref} · ${formatDateTime(r.createdAt)}`}
                    </AppText>
                  </View>
                  <AppText>{r.field ? `${t(`dataRights.kinds.${r.kind}`)}: ${r.field}` : t(`dataRights.kinds.${r.kind}`)}</AppText>
                  {r.status === 'open' ? (
                    <AppText variant="small" tone="muted">
                      {t('dataRights.answerBy', { date: formatDate(r.answerBy.slice(0, 10)) })}
                    </AppText>
                  ) : null}
                  {r.answer ? <AppText variant="small">{t('dataRights.answerLine', { answer: r.answer })}</AppText> : null}
                  {r.status === 'open' ? (
                    asking === r.id ? (
                      <View style={styles.buttons}>
                        <Button icon="cancel" label={t('dataRights.takeBackYes')} loading={sending} disabled={sending} onPress={() => void cancel(r)} />
                        <Button variant="link" label={t('dataRights.keep')} onPress={() => setAsking(null)} />
                      </View>
                    ) : (
                      <Button variant="link" icon="cancel" label={t('dataRights.takeBack')} onPress={() => setAsking(r.id)} />
                    )
                  ) : null}
                </View>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}

      {/* Who to write to, how long it takes, and the Board (Rule 14). */}
      <Section icon="info" title={t('dataRights.contactTitle')}>
        <AppText selectable>{t('dataRights.contactLine', PRIVACY_CONTACT)}</AppText>
        <AppText>{t('dataRights.replyLine', { days: ANSWER_DAYS })}</AppText>
        <AppText>{t('dataRights.boardLine')}</AppText>
        <PrivacyNoticeLink label={t('dataRights.noticeLink')} />
      </Section>
    </Screen>
  );
}

/** The chip's colour for a status. */
function statusTone(status: DataRequest['status']) {
  return status === 'done' ? 'success' : status === 'refused' ? 'danger' : status === 'open' ? 'warning' : 'neutral';
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  block: {
    gap: spacing.xs,
  },
  request: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
