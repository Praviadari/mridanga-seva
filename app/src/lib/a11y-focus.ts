// Moves the screen reader's focus to a part of the screen (audit phase 4 P2-02, docs/DECISIONS.md #332). When
// the button just pressed disappears (Accept turns into its confirm card, Delete into "Delete …?", Scan into the
// camera), TalkBack's focus is otherwise lost and the next swipe starts at the top of the page. Nothing changes
// for people who do not use a screen reader: on the phone the event only moves TalkBack's focus; on the web the
// element takes the keyboard focus, so the next Tab goes to the buttons right after it.

import { AccessibilityInfo, Platform } from 'react-native';

/** Wait before moving, so the new part is drawn and laid out first. */
const AFTER_DRAW_MS = 150;

type HostNode = Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0];

/**
 * Moves the screen reader's focus to `node` (a View or Text ref's current value) shortly after it is drawn.
 * Does nothing for null. Never throws.
 */
export function moveFocusTo(node: unknown): void {
  if (!node) return;
  setTimeout(() => {
    try {
      if (Platform.OS === 'web') {
        const element = node as HTMLElement;
        // A plain box takes focus only with a tabindex; -1 keeps it out of the Tab order.
        if (!element.hasAttribute?.('tabindex')) element.setAttribute?.('tabindex', '-1');
        element.focus?.();
        return;
      }
      AccessibilityInfo.sendAccessibilityEvent(node as HostNode, 'focus');
    } catch {
      // A screen without the part any more: nothing to do.
    }
  }, AFTER_DRAW_MS);
}
