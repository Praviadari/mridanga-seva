// Waiting for approval (docs/RHYTHM_PLAYGROUND.md §10.1-§10.2; docs/DECISIONS.md #746): everything a coordinator
// sent for approval, bols first (an exercise needs its bols approved), oldest first. A row opens its editor, where
// the head facilitator previews it (exercises: five sample challenges), approves, sends it back to draft or retires
// it. Coordinators see the same list, read-only: "waiting for the head facilitator".

import { router, Stack } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import type { AdminContent } from '@/data/playground-admin';
import { formatDate } from '@/lib/dates';
import { bolIndex, writtenKey } from '@/lib/playground/notation';

import { approvalQueue, type QueueRow } from './content-rules';
import { gameName, kindName, skillName, useAdminContent, useStaffRole } from './parts';

/** A queue row's name: the bol, the sound, the template's game and skill, the exercise's game and pattern. */
export function rowTitle(t: TFunction, row: QueueRow, content: AdminContent): string {
  if (row.kind === 'bol') {
    const b = content.bols.find((x) => x.id === row.id);
    return `${kindName(t, 'bol')}: ${b ? `${b.written} (${b.id})` : row.id}`;
  }
  if (row.kind === 'asset') {
    const a = content.assets.find((x) => String(x.id) === row.id);
    return `${kindName(t, 'asset')} #${row.id}${a ? ` · ${t(`staffPlayground.sound.kind_${a.kind}`)}` : ''}`;
  }
  if (row.kind === 'template') {
    const tpl = content.templates.find((x) => String(x.id) === row.id);
    return `${kindName(t, 'template')} #${row.id}${tpl ? ` · ${gameName(t, tpl.game)} · ${skillName(t, tpl.skill)}` : ''}`;
  }
  const ex = content.exercises.find((x) => String(x.id) === row.id);
  const pattern = ex?.sequence ? writtenKey(ex.sequence.join(' '), bolIndex(content.bols)) : '';
  return `${kindName(t, 'exercise')} #${row.id}${ex ? ` · ${gameName(t, ex.game)}` : ''}${pattern ? `: ${pattern}` : ''}`;
}

const EDITOR = { bol: '/staff/playground/bol/[id]', asset: '/staff/playground/sound/[id]', template: '/staff/playground/template/[id]', exercise: '/staff/playground/exercise/[id]' } as const;

/** Opens a row's editor. */
export function openRow(row: QueueRow) {
  router.push({ pathname: EDITOR[row.kind], params: { id: row.id } });
}

/** The screen. */
export function ApprovalQueue() {
  const { t } = useTranslation();
  const { head } = useStaffRole();
  const { content } = useAdminContent();
  const queue = content ? approvalQueue(content) : [];

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('staffPlayground.review.title') }} />
      <AppText tone="muted">{head ? t('staffPlayground.review.introHead') : t('staffPlayground.review.introStaff')}</AppText>
      {content === undefined ? <LoadingCards /> : null}
      {content === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {content && queue.length === 0 ? <EmptyState icon="tick" title={t('staffPlayground.review.empty')} /> : null}
      {content ? (
        <Columns>
          {queue.map((row) => (
            <ListRow
              key={`${row.kind}-${row.id}`}
              title={rowTitle(t, row, content)}
              details={[
                t('staffPlayground.revision', { n: row.revision }),
                row.firstPublishedIn !== null ? t('staffPlayground.review.changed') : t('staffPlayground.review.new'),
                t('staffPlayground.review.sent', { date: formatDate(row.updatedAt.slice(0, 10)) }),
              ]}
              onPress={() => openRow(row)}
            />
          ))}
        </Columns>
      ) : null}
    </Screen>
  );
}
