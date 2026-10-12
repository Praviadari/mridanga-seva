// The web side of keyboard.tsx: a browser moves the page for its own keyboard, so the plain parts.

import type { PropsWithChildren, Ref } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

/** Nothing to wrap on the web. */
export function KeyboardRoot({ children }: PropsWithChildren) {
  return children;
}

/** The plain ScrollView. */
export function KeyboardScrollView(props: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  return <ScrollView {...props} />;
}
