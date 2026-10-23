// Practice while waiting for the desk (migration 0057, docs/DECISIONS.md #510): the practice tools, the mantra before
// practice and the Beginner lesson videos for a login that signed up and waits for a coordinator's Accept. Open only
// in the 'pending' area (src/app/_layout.tsx), reached from the waiting page; the database gives these screens class
// content only. Same header bars as the student's screens.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { headerTitleOptions } from '@/components/header-title';
import { webBackOptions } from '@/components/web-back-button';
import { documentTitleLayout } from '@/lib/document-title';
import { useHeadingFont } from '@/theme/fonts';
import { headerBarOptions, useTheme } from '@/theme/use-theme';

/** Navigator for the screens a waiting login may practise with. */
export default function WaitingLayout() {
  const { colors } = useTheme();
  const titleFont = useHeadingFont();
  const bar = headerBarOptions(colors, titleFont);
  return (
    <>
      {/* Light status-bar icons on the saffron headers. */}
      <StatusBar style="light" />
      <Stack screenLayout={documentTitleLayout} screenOptions={{ ...bar, ...headerTitleOptions(bar.headerTitleStyle), ...webBackOptions }} />
    </>
  );
}
