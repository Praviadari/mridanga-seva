// Page frame used by every screen: keeps content clear of the notch and system bars, scrolls
// when the content is taller than the screen, moves up for the keyboard on iPhones, and keeps
// forms to a readable width on tablets and computers. Home screens put a full-width header band
// (components/home-header.tsx) above the content and use a wider column.

import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { useContext, type PropsWithChildren, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { maxContentWidth, maxDashboardWidth, spacing, useTheme } from '@/theme/use-theme';

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
}>;

/** Standard scrolling page with the app background colour. */
export function Screen({ centred, underHeader, header, wide, children }: ScreenProps) {
  const { colors } = useTheme();
  // Inside a tab navigator the tab bar already keeps clear of the phone's bottom edge.
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
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
      <KeyboardAvoidingView
        // Android resizes the window for the keyboard by itself; iOS needs the padding.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <ScrollView
          // Lets a tap on a button work at the first try while the keyboard is open.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, centred && styles.centred]}>
          {header}
          <View style={[styles.content, centred && styles.centred]}>
            <View style={[styles.column, { maxWidth: wide ? maxDashboardWidth : maxContentWidth }]}>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  column: {
    width: '100%',
    gap: spacing.md,
  },
});
