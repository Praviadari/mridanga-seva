// Page frame used by every screen: keeps content clear of the notch and system bars, scrolls
// when the content is taller than the screen, moves up for the keyboard on iPhones, and keeps
// forms to a readable width on tablets and computers.

import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { maxContentWidth, spacing, useTheme } from '@/theme/use-theme';

/** Props for Screen. */
export type ScreenProps = PropsWithChildren<{
  /** Centre the content vertically, for short pages like sign-in. Default false. */
  centred?: boolean;
  /**
   * The page has a header bar with a title and back button above it. The header already keeps
   * clear of the notch, so the page must not add that space a second time.
   */
  underHeader?: boolean;
}>;

/** Standard scrolling page with the app background colour. */
export function Screen({ centred, underHeader, children }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={underHeader ? ['left', 'right', 'bottom'] : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        // Android resizes the window for the keyboard by itself; iOS needs the padding.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <ScrollView
          // Lets a tap on a button work at the first try while the keyboard is open.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, centred && styles.centred]}>
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    padding: spacing.lg,
  },
  centred: {
    justifyContent: 'center',
  },
  column: {
    width: '100%',
    maxWidth: maxContentWidth,
    gap: spacing.md,
  },
});
