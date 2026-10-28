// Content library (docs/RHYTHM_PLAYGROUND.md §10.1; docs/DECISIONS.md #741): Bols · Sounds · Exercises · Templates,
// every row with its status (Draft / Waiting for approval / Approved / Retired), revision and "TEST placeholder";
// exercises with the pool size per game and level ("Sound Detective, Beginner: 14 approved — enough for variety"),
// so thin pools are visible (§8.7). Add opens the editor; a row opens its editor. Retired rows are listed last.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import type { AdminContent, ContentMeta } from '@/data/playground-admin';
import { levelName } from '@/i18n/labels';
import { DEFAULT_ROUND_LEN } from '@/lib/playground/generator';
import { bolIndex, writtenKey } from '@/lib/playground/notation';

import { enoughFor, poolSizes } from './content-rules';
import { gameName, skillName, statusLine, useAdminContent } from './parts';

export type LibraryTab = 'bols' | 'sounds' | 'exercises' | 'templates';
const TABS: readonly LibraryTab[] = ['bols', 'sounds', 'exercises', 'templates'];

const byStatus = <T extends ContentMeta>(rows: readonly T[]) => [...rows].sort((a, b) => Number(a.status === 'retired') - Number(b.status === 'retired'));

type Row = { key: string; title: string; details: string[]; href: Parameters<typeof router.push>[0] };

function rowsFor(tab: LibraryTab, content: AdminContent, t: TFunction): Row[] {
  const index = bolIndex(content.bols);
  if (tab === 'bols') {
    return byStatus(content.bols).map((b) => ({
      key: b.id,
      title: `${b.written} (${b.id})`,
      details: [statusLine(t, b), `${levelName(t, b.levelId)} · ${t(`staffPlayground.bol.head_${b.head}`)}`],
      href: { pathname: '/staff/playground/bol/[id]', params: { id: b.id } },
    }));
  }
  if (tab === 'sounds') {
    return byStatus(content.assets).map((a) => ({
      key: String(a.id),
      title: `${t(`staffPlayground.sound.kind_${a.kind}`)} #${a.id}${a.performer ? ` · ${a.performer}` : ''}`,
      details: [statusLine(t, a), a.path ? t('staffPlayground.sound.uploaded') : t('staffPlayground.sound.bundled', { key: a.bundledKey ?? '' })],
      href: { pathname: '/staff/playground/sound/[id]', params: { id: String(a.id) } },
    }));
  }
  if (tab === 'templates') {
    return byStatus(content.templates).map((tpl) => ({
      key: String(tpl.id),
      title: `${gameName(t, tpl.game)} · ${skillName(t, tpl.skill)}`,
      details: [
        statusLine(t, tpl),
        t('staffPlayground.template.summary', { from: levelName(t, tpl.levelMin), to: levelName(t, tpl.levelMax), count: tpl.steps.length }),
      ],
      href: { pathname: '/staff/playground/template/[id]', params: { id: String(tpl.id) } },
    }));
  }
  return byStatus(content.exercises).map((ex) => ({
    key: String(ex.id),
    title: `${gameName(t, ex.game)} #${ex.id}: ${ex.sequence ? writtenKey(ex.sequence.join(' '), index) : t('staffPlayground.exercise.recorded')}`,
    details: [statusLine(t, ex), levelName(t, ex.levelId)],
    href: { pathname: '/staff/playground/exercise/[id]', params: { id: String(ex.id) } },
  }));
}

const NEW_HREF = {
  bols: { pathname: '/staff/playground/bol/[id]', params: { id: 'new' } },
  sounds: { pathname: '/staff/playground/sound/[id]', params: { id: 'new' } },
  exercises: { pathname: '/staff/playground/exercise/[id]', params: { id: 'new' } },
  templates: { pathname: '/staff/playground/template/[id]', params: { id: 'new' } },
} as const;

/** The screen. */
export function ContentLibrary() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: LibraryTab = TABS.includes(params.tab as LibraryTab) ? (params.tab as LibraryTab) : 'bols';
  const { content } = useAdminContent();
  const rows = content ? rowsFor(tab, content, t) : [];

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('staffPlayground.library.title') }} />
      <ChoiceGroup<LibraryTab>
        segmented
        accessibilityLabel={t('staffPlayground.library.title')}
        value={tab}
        onChange={(value) => router.setParams({ tab: value })}
        choices={TABS.map((value) => ({ value, label: t(`staffPlayground.library.tab_${value}`) }))}
      />
      <AppText tone="muted">{t(`staffPlayground.library.intro_${tab}`)}</AppText>
      <Button icon="add" label={t(`staffPlayground.library.add_${tab}`)} onPress={() => router.push(NEW_HREF[tab])} />
      {content === undefined ? <LoadingCards /> : null}
      {content === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {content && tab === 'exercises' ? <PoolSizes content={content} /> : null}
      {content && rows.length === 0 ? <EmptyState icon="library" title={t('staffPlayground.library.empty')} /> : null}
      <Columns>
        {rows.map((row) => (
          <ListRow key={row.key} title={row.title} details={row.details} onPress={() => router.push(row.href)} />
        ))}
      </Columns>
    </Screen>
  );
}

/** Pool sizes per game and level: approved, waiting, and whether that is enough for varied rounds. */
function PoolSizes({ content }: { content: AdminContent }) {
  const { t } = useTranslation();
  const sizes = poolSizes(content.exercises);
  if (sizes.length === 0) return null;
  return (
    <Section icon="lists" title={t('staffPlayground.library.pools')} description={t('staffPlayground.library.poolsHint', { n: enoughFor(DEFAULT_ROUND_LEN) })}>
      {sizes.map((s) => (
        <AppText key={`${s.game}|${s.levelId}`}>
          {t('staffPlayground.library.pool', { game: gameName(t, s.game), level: levelName(t, s.levelId), count: s.approved })}
          {s.waiting > 0 ? ` · ${t('staffPlayground.library.poolWaiting', { count: s.waiting })}` : ''}
          {` · ${s.approved >= enoughFor(DEFAULT_ROUND_LEN) ? t('staffPlayground.library.enough') : t('staffPlayground.library.thin')}`}
        </AppText>
      ))}
    </Section>
  );
}
