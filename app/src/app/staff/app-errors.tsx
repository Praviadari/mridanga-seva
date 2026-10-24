// App errors, the Guru's (Running the class; 0061, docs/DECISIONS.md #585-#587): what broke in the app on phones
// and on the web in the last 30 days, newest first, so a broken screen is seen before someone complains. Each line
// is one error on one screen and version within an hour, with how many times; nothing says who it happened to (the
// log keeps no person). The error's name, the screen's route and the version are technical words, not translated.
// Data: src/data/app-errors.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { APP_ERRORS_SHOWN, fetchAppErrors, type AppErrorRow } from '@/data/app-errors';
import { formatDateTime } from '@/lib/dates';

export default function AppErrorsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load, 'missing' = before 0061.
  const [rows, setRows] = useState<AppErrorRow[] | 'missing' | null | undefined>(undefined);

  const load = useCallback(async () => {
    setRows(await fetchAppErrors());
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (profile?.role === 'guru') void load();
    }, [load, profile?.role]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('appErrors.title')} />;
  const header = <Stack.Screen options={{ title: t('appErrors.title') }} />;
  if (rows === undefined || rows === null || rows === 'missing') {
    return (
      <Screen underHeader centred>
        {header}
        {rows === undefined ? <LoadingCards /> : null}
        {rows === 'missing' ? <Notice tone="info">{t('appErrors.missing')}</Notice> : null}
        {rows === null ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.times, 0);
  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <ScreenIntro text={t('appErrors.intro')} />
      {rows.length === 0 ? (
        <EmptyState icon="check" title={t('appErrors.none')} />
      ) : (
        <Section icon="alert" title={t('appErrors.listTitle', { count: total })} description={rows.length >= APP_ERRORS_SHOWN ? t('appErrors.newestOnly', { n: APP_ERRORS_SHOWN }) : undefined}>
          {rows.map((r) => (
            <ListRow
              key={r.id}
              leading="alert"
              title={`${r.errorName} · ${r.screen}`}
              details={[
                t('appErrors.line', {
                  kind: t(r.kind === 'crash' ? 'appErrors.crash' : 'appErrors.unhandled'),
                  who: t(`appErrors.area.${r.area}`),
                  platform: r.platform,
                  version: r.version,
                }),
                t('appErrors.when', { count: r.times, last: formatDateTime(r.lastAt) }),
              ]}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}
