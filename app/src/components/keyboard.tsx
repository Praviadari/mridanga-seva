// The phone keyboard and the page (docs/DECISIONS.md #269). Android draws the app edge to edge on
// this SDK, so the window no longer shrinks for the keyboard (adjustResize does nothing) and a
// focused box near the bottom stayed hidden behind it. react-native-keyboard-controller follows
// the keyboard instead: KeyboardRoot wraps the app once (src/app/_layout.tsx), KeyboardScrollView is
// the scrolling part of every Screen. It scrolls the focused box above the keyboard and adds room
// under the page so the last field and the button can be scrolled up while the keyboard is open.
// The web has its own keyboard handling: keyboard.web.tsx uses the plain parts.

import type { PropsWithChildren, Ref } from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/** Space kept between the keyboard and the focused box, so its hint or error shows too. */
const BOTTOM_OFFSET = 96;

/** Wraps the whole app once: follows the keyboard for every page. */
export function KeyboardRoot({ children }: PropsWithChildren) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

/** A ScrollView that keeps the focused box above the keyboard. */
export function KeyboardScrollView({ ref, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  // Its ref is a ScrollView with one more method, so a ScrollView ref takes it.
  return <KeyboardAwareScrollView ref={ref as Ref<KeyboardAwareScrollViewRef>} bottomOffset={BOTTOM_OFFSET} {...props} />;
}
