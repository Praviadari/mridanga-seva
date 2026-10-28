// Rhythm Playground for facilitators (docs/RHYTHM_PLAYGROUND.md §6.2, §10.1; docs/DECISIONS.md #740): opened from
// Teaching → Rhythm Playground. Where the content stands (the published version, what waits for approval, what the
// next publish changes) and the rows: Content library, Waiting for approval, Publish (the head facilitator),
// Assignments, Class progress, Recordings to review (the existing assessments list, #694).

import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Columns } from '@/components/columns';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { formatDate } from '@/lib/dates';

import { approvalQueue, nextPublish } from './content-rules';
import { useAdminContent, useStaffRole } from './parts';

/** The screen. */
export function PlaygroundAdminHome() {
  const { t } = useTranslation();
  const { head } = useStaffRole();
  const { content } = useAdminContent();
  const waiting = content ? approvalQueue(content).length : 0;
  const next = content ? nextPublish(content) : null;
  const changes = next ? next.added.length + next.revised.length + next.leaving.length : 0;

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('staffPlayground.title') }} />
      <AppText tone="muted">{t('staffPlayground.intro')}</AppText>
      {content === undefined ? <LoadingCards /> : null}
      {content === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {content ? (
        <Notice tone="info" title={content.latest ? t('staffPlayground.home.version', { n: content.latest.version }) : t('staffPlayground.home.nothingPublished')}>
          {[
            content.latest ? t('staffPlayground.home.publishedOn', { date: formatDate(content.latest.publishedAt.slice(0, 10)) }) : null,
            t('staffPlayground.home.waiting', { count: waiting }),
            t('staffPlayground.home.changes', { count: changes }),
          ]
            .filter(Boolean)
            .join(' ')}
        </Notice>
      ) : null}
      <Section icon="library" title={t('staffPlayground.home.content')}>
        <Columns>
          <ListRow leading="library" title={t('staffPlayground.library.title')} details={[t('staffPlayground.library.detail')]} onPress={() => router.push('/staff/playground/library')} />
          <ListRow
            leading="todo"
            title={t('staffPlayground.review.title')}
            details={[t('staffPlayground.home.waiting', { count: waiting })]}
            highlight={head && waiting > 0 ? 'attention' : undefined}
            onPress={() => router.push('/staff/playground/review')}
          />
          {head ? (
            <ListRow
              leading="send"
              title={t('staffPlayground.publish.title')}
              details={[t('staffPlayground.home.changes', { count: changes })]}
              onPress={() => router.push('/staff/playground/publish')}
            />
          ) : null}
        </Columns>
      </Section>
      <Section icon="students" title={t('staffPlayground.home.students')}>
        <Columns>
          <ListRow leading="todo" title={t('staffPlayground.assign.title')} details={[t('staffPlayground.assign.detail')]} onPress={() => router.push('/staff/playground/assignments')} />
          <ListRow leading="level" title={t('staffPlayground.class.title')} details={[t('staffPlayground.class.detail')]} onPress={() => router.push('/staff/playground/class')} />
          <ListRow leading="assessment" title={t('staffPlayground.home.recordings')} details={[t('staffPlayground.home.recordingsDetail')]} onPress={() => router.push('/staff/assessments')} />
        </Columns>
      </Section>
      {head ? (
        <AppText variant="small" tone="muted">
          {t('staffPlayground.home.settingsNote')}
        </AppText>
      ) : null}
    </Screen>
  );
}
