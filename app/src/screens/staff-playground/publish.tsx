// Publish (docs/RHYTHM_PLAYGROUND.md §10.1, §10.3, §19.3; docs/DECISIONS.md #747): the head facilitator only. The
// version students have now, what the next version changes (new and changed items approved since, items that left
// the pack: retired, or sent back for approval after an edit), the pool sizes it gives, a note, and Publish
// (publish_playground: one new version number; phones refresh their pack when it changes). Placeholder (TEST)
// content is refused on LIVE by the database; the screen says so first. Nothing to publish: the button waits.

import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { publishPlayground } from '@/data/playground';
import { formatDate } from '@/lib/dates';
import { levelName } from '@/i18n/labels';

import { approvedPlaceholders, nextPublish, poolSizes, type QueueRow } from './content-rules';
import { gameName, useAdminContent, useStaffRole } from './parts';
import { openRow, rowTitle } from './review';

/** The screen. */
export function PublishScreen() {
  const { t } = useTranslation();
  const { head } = useStaffRole();
  const { content, reload } = useAdminContent();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (!head) return <GuruOnly title={t('staffPlayground.publish.title')} />;

  const next = content ? nextPublish(content) : null;
  const changes = next ? next.added.length + next.revised.length + next.leaving.length : 0;
  const placeholders = content ? approvedPlaceholders(content) : 0;

  const publish = async () => {
    setBusy(true);
    setError(null);
    const result = await publishPlayground(note.trim() || null);
    setBusy(false);
    if (result.errorKey) {
      setError(t(result.errorKey));
      return;
    }
    setDone(result.version);
    setNote('');
    void reload();
  };

  const list = (title: string, rows: QueueRow[]) =>
    content && rows.length > 0 ? (
      <Section icon="lists" title={title}>
        {rows.map((row) => (
          <ListRow key={`${row.kind}-${row.id}`} title={rowTitle(t, row, content)} details={[t('staffPlayground.revision', { n: row.revision })]} onPress={() => openRow(row)} />
        ))}
      </Section>
    ) : null;

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('staffPlayground.publish.title') }} />
      <AppText tone="muted">{t('staffPlayground.publish.intro')}</AppText>
      {content === undefined ? <LoadingCards /> : null}
      {content === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {done !== null ? <Notice tone="success" announced>{t('staffPlayground.publish.done', { n: done })}</Notice> : null}
      {content ? (
        <>
          <AppText>
            {content.latest
              ? t('staffPlayground.publish.current', { n: content.latest.version, date: formatDate(content.latest.publishedAt.slice(0, 10)) })
              : t('staffPlayground.home.nothingPublished')}
          </AppText>
          {content.latest?.note ? <AppText tone="muted">{content.latest.note}</AppText> : null}
          {changes === 0 ? <Notice tone="info">{t('staffPlayground.publish.nothing')}</Notice> : null}
          {list(t('staffPlayground.publish.added'), next?.added ?? [])}
          {list(t('staffPlayground.publish.revised'), next?.revised ?? [])}
          {list(t('staffPlayground.publish.leaving'), next?.leaving ?? [])}
          <Section icon="level" title={t('staffPlayground.library.pools')}>
            {poolSizes(content.exercises).map((s) => (
              <AppText key={`${s.game}|${s.levelId}`}>{t('staffPlayground.library.pool', { game: gameName(t, s.game), level: levelName(t, s.levelId), count: s.approved })}</AppText>
            ))}
          </Section>
          {placeholders > 0 ? <Notice tone="warning">{t('staffPlayground.publish.placeholders', { count: placeholders })}</Notice> : null}
          <TextField label={t('staffPlayground.publish.note')} hint={t('staffPlayground.publish.noteHint')} value={note} onChangeText={setNote} maxLength={300} multiline />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button icon="send" label={t('staffPlayground.publish.button')} loading={busy} disabled={changes === 0} onPress={() => void publish()} />
        </>
      ) : null}
    </Screen>
  );
}
