// Page frame used by every screen: keeps content clear of the notch and system bars, scrolls
// when the content is taller than the screen, keeps the focused box above the phone keyboard
// (components/keyboard.tsx, docs/DECISIONS.md #269), lets forms scroll to a field (components/form-focus.tsx), and keeps
// forms to a readable width on tablets and computers. Home screens put a full-width header band
// (components/home-header.tsx) above the content and use a wider column. On staff screens a downloaded app
// update is offered at the top (UpdateNoticeOnScreens, FLOW-06); home screens place it themselves. In dark mode a
// night gradient sits behind the content and does not scroll with it (components/page-backdrop.tsx, #371).

import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { use, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Platform, RefreshControl, StyleSheet, View, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { maxContentWidth, maxDashboardWidth, spacing, useTheme } from '@/theme/use-theme';

import { FormScrollContext } from './form-focus';
import { KeyboardScrollView } from './keyboard';
import { PageBackdrop } from './page-backdrop';
import { UpdateNotice, UpdateNoticeOnScreens } from './update-notice';

/** Props for Screen. */
export type ScreenProps = PropsWithChildren<{
  /** Centre the content vertically, for short pages like sign-in. Default false. */
  centred?: boolean;
  /**
   * The page has a header bar with a title and back button above it. The header already keeps
   * clear of the notch, so the page must not add that space a second time.
   */
  underHeader?: boolean;
  /**
   * A band drawn edge to edge above the content, scrolling with it, e.g. the home screens'
   * HomeHeader. It keeps clear of the notch itself, so the page does not.
   */
  header?: ReactNode;
  /** Use the wider dashboard column (home screens) instead of the reading width. Default false. */
  wide?: boolean;
  /**
   * Loads the page's data again when the person pulls the list down (phones only; a browser has
   * its own reload). The spinner stays until the returned promise settles.
   */
  onRefresh?: () => Promise<unknown> | void;
  /** Less space above and below the content, the column filling the screen: the homes, which never scroll (#351, #777). */
  compact?: boolean;
}>;

/** Standard scrolling page with the app background: flat cream in light mode, a night gradient in dark mode. */
export function Screen({ centred, underHeader, header, wide, onRefresh, compact, children }: ScreenProps) {
  const { colors } = useTheme();
  // Inside a tab navigator the tab bar already keeps clear of the phone's bottom edge.
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  // Pages with a header band are homes, which show the notice under their greeting.
  const updateNotice = use(UpdateNoticeOnScreens) && !header;
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const scrollTarget = useMemo(() => ({ scroll, content }), []);
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  // A header bar or band above the page already keeps clear of the notch.
  const edges = [
    ...(underHeader || header ? [] : (['top'] as const)),
    'left',
    'right',
    ...(inTabs ? [] : (['bottom'] as const)),
  ] as const;
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* Dark mode's night gradient, fixed behind the scrolling content (#371); light mode stays flat. */}
      <PageBackdrop />
      <FormScrollContext value={scrollTarget}>
        <KeyboardScrollView
          ref={scroll}
          style={styles.fill}
          // Lets a tap on a button work at the first try while the keyboard is open.
          keyboardShouldPersistTaps="handled"
          // Pull to refresh on Android and iPhone; on the web the browser reloads.
          refreshControl={
            onRefresh && Platform.OS !== 'web' ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.surface}
              />
            ) : undefined
          }
          // With a header band the band stays at the top; only the content below it is centred.
          contentContainerStyle={styles.scroll}>
          {/* One View around the page: forms measure a field's place against it (form-focus.tsx). */}
          <View ref={content} collapsable={false} style={[styles.scroll, centred && !header && styles.centred]}>
            {header}
            <View style={[styles.content, centred && styles.centred, compact && styles.compact]}>
              <View style={[styles.column, compact && styles.compactColumn, { maxWidth: wide ? maxDashboardWidth : maxContentWidth }]}>
                {updateNotice ? <UpdateNotice /> : null}
                {children}
              </View>
            </View>
          </View>
        </KeyboardScrollView>
      </FormScrollContext>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    // 16 px at the sides leaves a 375 px phone 343 px for cards; 24 above and below.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  centred: {
    justifyContent: 'center',
  },
  compact: {
    paddingVertical: spacing.sm,
  },
  // The homes' blocks (notices, ring, fact) sit closer, so the fact card fits a 360 x 760 phone too; the column fills the
  // screen, so the staff homes' ring can take the room that is left (components/home-ring.tsx, #777).
  compactColumn: {
    gap: spacing.sm,
    flexGrow: 1,
  },
  column: {
    width: '100%',
    gap: spacing.md,
  },
});
