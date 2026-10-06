// Speaks a message on TalkBack (Android) and VoiceOver (iOS) without moving the focus: errors,
// confirmations and results that appear on a screen (DECISIONS #105). On the web, the role="alert"
// and role="status" boxes of Notice are live regions already, so the browser's reader speaks them.

import { Children, isValidElement, type ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Reads the message out once, if a screen reader is on. Does nothing on the web or for empty text. */
export function announce(message: string | null | undefined): void {
  const text = message?.trim();
  if (Platform.OS === 'web' || !text) return;
  AccessibilityInfo.announceForAccessibility(text);
}

/** The plain text inside React children (strings, numbers and the children of elements), for announce(). */
export function textOf(children: ReactNode): string {
  const parts: string[] = [];
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') parts.push(String(child));
    else if (isValidElement<{ children?: ReactNode }>(child)) parts.push(textOf(child.props.children));
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
