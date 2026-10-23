// Beginner lessons for a login waiting for the desk (migration 0057, docs/DECISIONS.md #510; audit 22-10-2026 fix 8):
// the approved lesson videos of the first level, each opening in the lesson player (V3). The list is kept on this
// device (data/waiting.ts), so it shows offline too; the videos themselves need the internet.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchBeginnerLessons, fetchWaitingAccess, savedBeginnerLessons, savedWaitingAccess, type WaitingLesson } from '@/data/waiting';
import { goBackOr } from '@/lib/go-back';

/** The Beginner lessons screen. */
export function BeginnerLessons() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  // undefined = loading; the copy on this device shows at once.
  const [lessons, setLessons] = useState<WaitingLesson[] | null | undefined>(() => savedBeginnerLessons() ?? undefined);
  const [offline, setOffline] = useState(false);
  const [closed, setClosed] = useState(false);

  const load = useCallback(async () => {
    const level = await fetchWaitingAccess(profileId);
    if (level === null) {
      setClosed(true);
      return;
    }
    setClosed(false);
    const loaded = await fetchBeginnerLessons(level);
    setLessons(loaded ? loaded.lessons : null);
    setOffline(loaded?.saved ?? true);
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      // Only a login that may practise while waiting reaches this screen; one that may not (any more) is told so.
      if (savedWaitingAccess(profileId) === null) setClosed(true);
      void load();
    }, [load, profileId]),
  );

  const header = <Stack.Screen options={{ title: t('waiting.lessonsTitle') }} />;
  const back = <Button variant="secondary" icon="home" label={t('waiting.backToWaiting')} onPress={() => goBackOr('/pending')} />;

  if (closed) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="info" title={t('waiting.closedTitle')}>{t('waiting.closedBody')}</Notice>
        {back}
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('waiting.lessonsIntro')}</AppText>
      {offline && lessons ? <Notice tone="info">{t('waiting.lessonsOffline')}</Notice> : null}
      {lessons === undefined ? <LoadingCards /> : null}
      {lessons === null ? (
        <Notice tone="error" title={t('waiting.lessonsFailed')}>
          {t('common.networkError')}
        </Notice>
      ) : null}
      {lessons === null ? <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} /> : null}
      {lessons && lessons.length === 0 ? (
        <EmptyState icon="lessonVideo" title={t('waiting.lessonsEmptyTitle')} body={t('waiting.lessonsEmptyBody')} />
      ) : null}
      {lessons && lessons.length > 0 ? (
        <Section icon="lessonVideo" title={t('waiting.lessonsSection')}>
          {lessons.map((lesson) => (
            <ListRow
              key={lesson.id}
              leading="lessonVideo"
              title={lesson.title}
              details={lesson.body ? [lesson.body] : []}
              action={{
                label: t('practice.planWatch'),
                variant: 'secondary',
                accessibilityLabel: t('waiting.watchLesson', { title: lesson.title }),
                onPress: () => router.push({ pathname: '/waiting/lesson/[id]', params: { id: String(lesson.id) } }),
              }}
            />
          ))}
        </Section>
      ) : null}
      {back}
    </Screen>
  );
}
