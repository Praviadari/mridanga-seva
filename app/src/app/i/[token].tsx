// /i/<token>: the link in an asset label's QR code (docs/DECISIONS.md #159), opened by a phone's
// camera app in the browser, or typed. Open to every area (src/app/_layout.tsx) but shows nothing
// of the item itself: staff are forwarded to /staff/inventory/label/<token>, which asks the
// database; a signed-out visitor signs in first and then lands there (src/auth/requested-path.ts);
// anyone else is told the label is for the seva team, with the address to return a found item.

import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { rememberRequestedPath } from '@/auth/requested-path';
import { BrandSplash } from '@/components/brand';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

/** Forwards a label link to the right place. */
export default function AssetLinkScreen() {
  const { t } = useTranslation();
  const { area } = useAuth();
  const { token } = useLocalSearchParams<{ token: string }>();
  const staffPath = `/staff/inventory/label/${encodeURIComponent(token ?? '')}`;

  if (area === 'loading') return <BrandSplash />;
  if (area === 'guru' || area === 'coordinator') return <Redirect href={staffPath as Href} withAnchor />;
  if (area === 'signedOut') {
    rememberRequestedPath(staffPath);
    return <Redirect href="/sign-in" />;
  }
  return (
    <Screen centred>
      <EmptyState icon="instruments" title={t('labels.publicTitle')} body={t('labels.publicBody')} />
      <Button variant="secondary" icon="home" label={t('labels.home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
