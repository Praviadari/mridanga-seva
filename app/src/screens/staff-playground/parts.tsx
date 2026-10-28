// Pieces every facilitator Playground screen uses (docs/DECISIONS.md #740-#749): the content as it stands (read again
// whenever the screen comes back into view), names of games, skills, statuses and kinds, the status line of a row,
// and the status buttons under an editor — coordinators send a draft for approval (or take it back); the head
// facilitator approves, sends back, retires or restores (play_set_status; the triggers of 0065 check it again), and
// a draft never published can be deleted. The word "Guru" is never shown: the head facilitator is the approver.

import { router, useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { setContentStatus } from '@/data/playground';
import { deleteDraft, fetchContent, type AdminContent, type ContentMeta, type ContentTable } from '@/data/playground-admin';
import type { ContentStatus, GameId, SkillId } from '@/lib/playground/types';
import { skillKey } from '@/lib/playground-games/catalogue';
import type { ChipTone } from '@/theme/colors';

import { ACTION_STATUS, canDelete, statusActions, type ContentKind, type StatusAction } from './content-rules';

/** The signed-in login: staff, and whether it is the head facilitator (role guru, the one approver, #720). */
export function useStaffRole() {
  const { profile } = useAuth();
  return { head: profile?.role === 'guru', myId: profile?.id ?? null };
}

/** Every content row (undefined while loading, null when it could not be read); read again on coming back. */
export function useAdminContent() {
  const [content, setContent] = useState<AdminContent | null | undefined>(undefined);
  const reload = useCallback(async () => {
    setContent(await fetchContent());
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { content, reload };
}

export const gameName = (t: TFunction, game: GameId) => t(`playground.game.${game}.name`);

export function skillName(t: TFunction, skill: SkillId | string): string {
  const key = skillKey(skill);
  return key ? t(key) : skill;
}

export const statusName = (t: TFunction, status: ContentStatus) => t(`staffPlayground.status.${status}`);
export const kindName = (t: TFunction, kind: ContentKind) => t(`staffPlayground.kind.${kind}`);

const STATUS_TONE: Record<ContentStatus, ChipTone> = { draft: 'neutral', in_review: 'warning', approved: 'success', retired: 'danger' };

/** The status words of a row for a list: "Waiting for approval · revision 2 · TEST placeholder". */
export function statusLine(t: TFunction, row: ContentMeta): string {
  return [
    statusName(t, row.status),
    t('staffPlayground.revision', { n: row.revision }),
    row.status === 'approved' && row.publishedIn === null ? t('staffPlayground.notPublishedYet') : null,
    row.placeholder ? t('staffPlayground.placeholder') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The status of the row an editor shows, as coloured chips (the words are always there). */
export function StatusChips({ row }: { row: ContentMeta }) {
  const { t } = useTranslation();
  return (
    <>
      <Chip label={statusName(t, row.status)} tone={STATUS_TONE[row.status]} />
      <AppText variant="small" tone="muted">
        {[
          t('staffPlayground.revision', { n: row.revision }),
          row.publishedIn !== null ? t('staffPlayground.inVersion', { n: row.publishedIn }) : row.status === 'approved' ? t('staffPlayground.notPublishedYet') : null,
          row.placeholder ? t('staffPlayground.placeholder') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
    </>
  );
}

const ACTION_ICON = { submit: 'send', unsubmit: 'back', approve: 'tick', sendBack: 'reply', retire: 'retire', restore: 'restore' } as const;

const TABLE: Record<ContentKind, ContentTable> = { bol: 'play_bols', asset: 'play_assets', template: 'play_templates', exercise: 'play_exercises' };

/**
 * The status section under an editor: the chips, what an edit does to an approved row, the status buttons this
 * login may use, and Delete for a draft never published (asks once more first).
 */
export function StatusPanel({ kind, id, row, filePath, onChanged }: { kind: ContentKind; id: string | number; row: ContentMeta; filePath?: string | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { head, myId } = useStaffRole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = async (action: StatusAction) => {
    setBusy(true);
    setError(null);
    const errorKey = await setContentStatus(kind, id, ACTION_STATUS[action]);
    setBusy(false);
    if (errorKey) setError(t(errorKey));
    else onChanged();
  };
  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const errorKey = await deleteDraft(TABLE[kind], id, filePath);
    setBusy(false);
    if (errorKey) setError(t(errorKey));
    else router.back();
  };

  return (
    <Section icon="status" title={t('staffPlayground.statusTitle')}>
      <StatusChips row={row} />
      {row.status === 'approved' ? <AppText tone="muted">{t('staffPlayground.editApprovedHint')}</AppText> : null}
      {row.status === 'in_review' && !head ? <AppText tone="muted">{t('staffPlayground.waitingHint')}</AppText> : null}
      {row.status === 'retired' && !head ? <AppText tone="muted">{t('staffPlayground.retiredHint')}</AppText> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {statusActions(row.status, head).map((action, i) => (
        <Button
          key={action}
          variant={i === 0 ? 'primary' : 'secondary'}
          icon={ACTION_ICON[action]}
          label={t(`staffPlayground.action.${action}`)}
          disabled={busy}
          onPress={() => void act(action)}
        />
      ))}
      {canDelete(row, head, myId) ? (
        <>
          <Button variant="secondary" icon="delete" label={confirmDelete ? t('staffPlayground.confirmDelete') : t('staffPlayground.delete')} disabled={busy} onPress={() => void remove()} />
          {confirmDelete ? (
            <AppText variant="small" tone="muted">
              {t('staffPlayground.deleteHint')}
            </AppText>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
