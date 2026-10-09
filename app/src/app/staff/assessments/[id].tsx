// One assessment for staff (Phase 2): what the Guru set (G6: instructions, files, rubric, level,
// level-up), the releases with their due dates and notes (C12), and the tracker (C13): every
// student it was given to, Not seen / Seen / Submitted / Reviewed / Redo and Late, with "Remind"
// for everyone who has not sent it yet. Tapping a student opens their work (C14, review/[id].tsx).
// The Guru can send a draft to the coordinators, edit it (G6 edit, slice 2), or delete one that was never released.
// Data: src/data/assessments.ts; reminders are push notifications (migration 0016).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { assessmentKindName, assignmentStatusName, MediaList } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import {
  deleteAssessment,
  fetchStaffAssessment,
  isOverdue,
  OPEN_STATUSES,
  remindStudents,
  rubricTotal,
  sendAssessment,
  type StaffAssessment,
  type TrackerRow,
} from '@/data/assessments';
import { levelName } from '@/i18n/labels';
import { formatDateTime, formatDate } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

/** Which students the tracker shows. */
type Filter = 'all' | 'todo' | 'review' | 'done';

const IN_FILTER: Record<Filter, (row: TrackerRow) => boolean> = {
  all: () => true,
  todo: (row) => OPEN_STATUSES.includes(row.status),
  review: (row) => row.status === 'submitted',
  done: (row) => row.status === 'reviewed',
};

/** The assessment, its releases and the tracker. */
function StaffAssessmentScreenContent() {
  const { t } = useTranslation();
  const { area } = useAuth();
  const isGuru = area === 'guru';
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<StaffAssessment | 'not_found' | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<'send' | 'delete' | 'remind' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoaded(await fetchStaffAssessment(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('assessments.detail.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="error">{t('assessments.detail.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('assessments.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { assessment: a, releases, tracker, authorName } = loaded;
  const shown = tracker.filter(IN_FILTER[filter]);
  const toRemind = tracker.filter((row) => OPEN_STATUSES.includes(row.status) && row.hasLogin);
  const count = (f: Filter) => tracker.filter(IN_FILTER[f]).length;

  async function send() {
    setBusy('send');
    const errorKey = await sendAssessment(a.id);
    setBusy(null);
    setMessage(errorKey ? { tone: 'error', text: t(errorKey) } : { tone: 'success', text: t('assessments.detail.sentDone') });
    if (!errorKey) await load();
  }

  async function remove() {
    setBusy('delete');
    const errorKey = await deleteAssessment(a);
    setBusy(null);
    if (errorKey) {
      setConfirmDelete(false);
      setMessage({ tone: 'error', text: t(errorKey) });
      return;
    }
    router.replace('/staff/assessments');
  }

  async function remindAll() {
    setBusy('remind');
    const { result, errorKey } = await remindStudents(toRemind.map((row) => row.assignmentId));
    setBusy(null);
    if (!result) {
      setMessage({ tone: 'error', text: t(errorKey ?? 'common.genericError') });
      return;
    }
    setMessage({
      tone: result.reminded > 0 ? 'success' : 'info',
      text: [
        t('assessments.remind.done', { count: result.reminded }),
        ...(result.skipped > 0 ? [t('assessments.remind.skipped', { count: result.skipped })] : []),
      ].join(' '),
    });
    await load();
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <Section title={a.title}>
        <View style={styles.chips}>
          <Chip label={levelName(t, a.levelId)} tone="level" />
          <Chip label={assessmentKindName(t, a.kind)} tone="neutral" />
          {a.levelUp ? <Chip label={t('assessments.levelUp')} tone="warning" /> : null}
          {a.sentAt ? null : <Chip label={t('assessments.draft')} tone="info" />}
        </View>
        {a.instructions ? <AppText>{a.instructions}</AppText> : null}
        <MediaList files={a.media} link={a.mediaLink} />
        <AppText variant="label">{t('assessments.detail.rubric', { max: rubricTotal(a.rubric) })}</AppText>
        {a.rubric.map((line, i) => (
          <AppText key={`${line.criterion}-${i}`} tone="muted">
            {t('assessments.detail.rubricLine', { criterion: line.criterion, max: line.max })}
          </AppText>
        ))}
        <AppText variant="small" tone="muted">
          {[
            ...(authorName ? [t('assessments.detail.setBy', { name: authorName })] : []),
            a.sentAt ? t('assessments.sentOn', { date: formatDateTime(a.sentAt) }) : t('assessments.detail.draftNote'),
          ].join(' · ')}
        </AppText>
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {isGuru && !a.sentAt ? (
        <Button icon="send" label={t('assessments.detail.send')} loading={busy === 'send'} onPress={() => void send()} />
      ) : null}
      {isGuru ? (
        <Button
          variant="secondary"
          icon="edit"
          label={t('assessments.edit.button')}
          onPress={() => router.push({ pathname: '/staff/assessments/edit/[id]', params: { id: String(a.id) } })}
        />
      ) : null}
      {a.sentAt ? (
        <Button
          icon="students"
          label={t('assessments.detail.release')}
          onPress={() => router.push({ pathname: '/staff/assessments/release/[id]', params: { id: String(a.id) } })}
        />
      ) : null}

      {releases.length > 0 ? (
        <Section title={t('assessments.detail.releases')}>
          {releases.map((r) => (
            <View key={r.id} style={styles.release}>
              <AppText variant="label">
                {t('assessments.detail.releaseLine', {
                  due: formatDate(r.dueOn),
                  name: r.releasedByName ?? t('assessments.detail.someone'),
                })}
              </AppText>
              {r.notes ? <AppText tone="muted">{r.notes}</AppText> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {tracker.length > 0 ? (
        <Section title={t('assessments.tracker.title')} description={t('assessments.tracker.hint')}>
          <ChoiceGroup
            chips
            choices={(['all', 'todo', 'review', 'done'] as const).map((f) => ({
              value: f,
              label: t(`assessments.tracker.filter.${f}`, { count: count(f) }),
            }))}
            value={filter}
            onChange={setFilter}
          />
          {toRemind.length > 0 ? (
            <Button
              variant="secondary"
              icon="send"
              label={t('assessments.remind.all', { count: toRemind.length })}
              loading={busy === 'remind'}
              onPress={() => void remindAll()}
            />
          ) : null}
          {shown.length === 0 ? <AppText tone="muted">{t('assessments.tracker.none')}</AppText> : null}
          {shown.map((row) => (
            <ListRow
              key={row.assignmentId}
              leading="initials"
              title={row.fullName}
              highlighted={row.status === 'reviewed'}
              details={[
                [
                  assignmentStatusName(t, row.status),
                  ...(isOverdue(row) ? [t('assessments.late')] : []),
                  ...(row.score !== null && row.scoreMax !== null && row.status !== 'submitted'
                    ? [t('assessments.scoreOf', { score: row.score, max: row.scoreMax })]
                    : []),
                  ...(row.sendLevelUp ? [t('assessments.review.sentToGuru')] : []),
                ].join(' · '),
                [row.rollNo, t('assessments.dueOn', { date: formatDate(row.dueOn) })].join(' · '),
                ...(row.hasLogin ? [] : [t('assessments.tracker.noLogin')]),
                ...(row.lastRemindedAt
                  ? [t('assessments.tracker.reminded', { date: formatDateTime(row.lastRemindedAt) })]
                  : []),
              ]}
              onPress={() =>
                router.push({ pathname: '/staff/assessments/review/[id]', params: { id: String(row.assignmentId) } })
              }
            />
          ))}
        </Section>
      ) : a.sentAt ? (
        <AppText tone="muted">{t('assessments.notReleased')}</AppText>
      ) : null}

      {isGuru && releases.length === 0 ? (
        confirmDelete ? (
          <Notice tone="error" title={t('assessments.detail.deleteAsk')}>
            {t('assessments.detail.deleteNote')}
          </Notice>
        ) : null
      ) : null}
      {isGuru && releases.length === 0 ? (
        <View style={styles.row}>
          <Button
            variant={confirmDelete ? 'primary' : 'link'}
            icon="delete"
            label={confirmDelete ? t('assessments.detail.deleteYes') : t('assessments.detail.delete')}
            loading={busy === 'delete'}
            onPress={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
          />
          {confirmDelete ? (
            <Button variant="link" label={t('assessments.detail.deleteNo')} onPress={() => setConfirmDelete(false)} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  release: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffAssessmentScreen() {
  return (
    <RouteIdGuard kind="number">
      <StaffAssessmentScreenContent />
    </RouteIdGuard>
  );
}
