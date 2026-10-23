// Data requests, the Guru only (audit 22-10-2026 fix 17, docs/DECISIONS.md #550-#556): every open request, the one
// to answer first at the top with its answer-by date (30 days, #551), amber when 3 days or less are left; then those
// closed in the last 90 days. A row opens the request (data-requests/[id].tsx). "Record a request" writes down one
// made at the desk or by email: for a child, the parent's or guardian's (Rule 10), whose ID the desk has seen.
// Opened from the To do list and from the notices about requests. Data: src/data/data-rights.ts (0059).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { Fold } from '@/components/fold';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  ALL_KINDS,
  checkRequestForm,
  daysLeft,
  fetchAllRequests,
  recordRequest,
  REQUEST_FIELD_MAX,
  REQUEST_TEXT_MAX,
  type AskedBy,
  type DataRequest,
  type DeskForm,
  type RequestFormErrors,
} from '@/data/data-rights';
import { formatDate, formatDateTime } from '@/lib/dates';

const EMPTY_DESK: DeskForm = { who: '', kind: null, field: '', body: '', source: 'desk', askedBy: 'parent' };

/** The Guru's list of data requests. */
export default function DataRequestsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [list, setList] = useState<DataRequest[] | 'not_set_up' | null | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [form, setForm] = useState<DeskForm>(EMPTY_DESK);
  const [errors, setErrors] = useState<RequestFormErrors & { who?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    setList(await fetchAllRequests());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('dataRequests.title')} />;

  async function save() {
    const found: RequestFormErrors & { who?: boolean } = { ...checkRequestForm(form), ...(form.who.trim() ? {} : { who: true }) };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setMessage(null);
    const outcome = await recordRequest(form);
    setSaving(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('dataRequests.recorded', { ref: outcome.ref }) });
    setForm(EMPTY_DESK);
    await load();
  }

  const loaded = Array.isArray(list) ? list : null;
  const open = loaded?.filter((r) => r.status === 'open') ?? [];
  const closed = loaded?.filter((r) => r.status !== 'open') ?? [];

  const row = (r: DataRequest) => {
    const left = daysLeft(r.answerBy);
    const who = r.person?.name ? [r.person.name, r.person.rollNo].filter(Boolean).join(' · ') : t('dataRequests.personGone');
    const when =
      r.status !== 'open'
        ? t(`dataRights.statuses.${r.status}`) + (r.closedAt ? ` · ${formatDateTime(r.closedAt)}` : '')
        : left < 0
          ? t('dataRequests.overdue', { count: -left })
          : t('dataRequests.dueIn', { count: left, date: formatDate(r.answerBy.slice(0, 10)) });
    return (
      <ListRow
        key={r.id}
        title={`${r.ref} · ${t(`dataRights.kinds.${r.kind}`)}`}
        details={[who, when, t(`dataRequests.from.${r.source}`) + (r.askedBy === 'self' ? '' : ` · ${t(`dataRequests.askedBy.${r.askedBy}`)}`)]}
        highlight={r.status === 'open' && left <= 3 ? 'attention' : undefined}
        onPress={() => router.push({ pathname: '/staff/data-requests/[id]', params: { id: r.id } })}
      />
    );
  };

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('dataRequests.title') }} />
      <ScreenIntro text={t('dataRequests.intro')} />
      {list === undefined ? <LoadingCards /> : null}
      {list === null ? (
        <>
          <Notice tone="error">{t('common.networkError')}</Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {list === 'not_set_up' ? <Notice tone="info">{t('dataRights.notSetUp')}</Notice> : null}
      {loaded ? (
        <>
          <Section icon="todo" title={t('dataRequests.openTitle', { count: open.length })}>
            {open.length === 0 ? <EmptyState icon="check" title={t('dataRequests.noneOpen')} /> : open.map(row)}
          </Section>
          <Fold icon="add" title={t('dataRequests.recordTitle')} description={t('dataRequests.recordHint')} open={recording} onToggle={setRecording}>
            <TextField
              label={t('dataRequests.whoLabel')}
              hint={t('dataRequests.whoHint')}
              value={form.who}
              onChangeText={(who) => setForm((f) => ({ ...f, who }))}
              autoCapitalize="none"
              autoCorrect={false}
              required
              error={errors.who ? t('dataRequests.whoRequired') : undefined}
            />
            <ChoiceGroup
              label={t('dataRights.kindLabel')}
              chips
              choices={ALL_KINDS.map((k) => ({ value: k, label: t(`dataRights.kinds.${k}`) }))}
              value={form.kind}
              onChange={(kind) => setForm((f) => ({ ...f, kind }))}
              error={errors.kind ? t(errors.kind) : undefined}
            />
            <ChoiceGroup
              label={t('dataRequests.sourceLabel')}
              segmented
              choices={(['desk', 'email'] as const).map((s) => ({ value: s, label: t(`dataRequests.from.${s}`) }))}
              value={form.source}
              onChange={(source) => setForm((f) => ({ ...f, source }))}
            />
            <ChoiceGroup<AskedBy>
              label={t('dataRequests.askedByLabel')}
              segmented
              choices={(['self', 'parent', 'guardian'] as const).map((a) => ({ value: a, label: t(`dataRequests.askedBy.${a}`) }))}
              value={form.askedBy}
              onChange={(askedBy) => setForm((f) => ({ ...f, askedBy }))}
            />
            {form.askedBy !== 'self' ? <Notice tone="info">{t('dataRequests.parentIdHint')}</Notice> : null}
            {form.kind === 'correction' ? (
              <TextField
                label={t('dataRights.fieldLabel')}
                value={form.field}
                onChangeText={(field) => setForm((f) => ({ ...f, field }))}
                maxLength={REQUEST_FIELD_MAX}
                required
                error={errors.field ? t(errors.field, { max: REQUEST_FIELD_MAX }) : undefined}
              />
            ) : null}
            <TextField
              label={t('dataRequests.bodyLabel')}
              value={form.body}
              onChangeText={(body) => setForm((f) => ({ ...f, body }))}
              multiline
              maxLength={REQUEST_TEXT_MAX}
              counter={REQUEST_TEXT_MAX}
              error={errors.body ? t(errors.body, { max: REQUEST_TEXT_MAX }) : undefined}
            />
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Button icon="check" label={t('dataRequests.record')} loading={saving} disabled={saving} onPress={() => void save()} />
          </Fold>
          {closed.length > 0 ? (
            <Section icon="check" title={t('dataRequests.closedTitle')}>
              {closed.map(row)}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
