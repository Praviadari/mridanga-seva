// Checks the id in a screen's address before the screen loads anything (D6-07). An edited or cut-off
// web link or an old bookmark ("/staff/announcements/abc") would otherwise reach the database, be
// refused as bad input and show "no internet" with a Try again that can never work.

import { router, useLocalSearchParams } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { isRouteId } from '@/lib/route-id';

import { AppText } from './app-text';
import { Button } from './button';
import { Screen } from './screen';

type Props = PropsWithChildren<{ kind: 'number' | 'uuid'; allowNew?: boolean }>;

/** Shows the screen when the address's `id` is valid, otherwise "page does not exist". */
export function RouteIdGuard({ kind, allowNew = false, children }: Props) {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isRouteId(id, kind, allowNew)) return children;
  return (
    <Screen underHeader centred>
      <AppText variant="subtitle">{t('notFound.title')}</AppText>
      <Button label={t('notFound.goHome')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
