// Takes the person to the first field with a problem when a form is sent (docs/DECISIONS.md #268):
// the page scrolls it into view and a text box gets the cursor (the keyboard opens on a phone).
// Screen provides the scrolling part; a form marks its fields with `target(key)` from useFormFocus
// and calls `focusFirst(order, errors)` after checking. Fields that are not text boxes (date of
// birth, choices) are wrapped in a View carrying the target.

import { createContext, use, useCallback, useRef, type RefObject } from 'react';
import { Platform, type ScrollView, type TextInput, type View } from 'react-native';

import { moveFocusTo } from '@/lib/a11y-focus';
import { useReducedMotion } from '@/lib/reduced-motion';

/** A field the page can scroll to: a text box or a View around another kind of field. */
export type FieldNode = View | TextInput;

/** What Screen gives its forms: the scrolling part and the View holding the whole page. */
export type ScrollTarget = { scroll: RefObject<ScrollView | null>; content: RefObject<View | null> };

export const FormScrollContext = createContext<ScrollTarget | null>(null);

/** Room left above the field after scrolling, so its label shows under a header. */
const ABOVE = 96;

/**
 * Scrolls the page to `node` and focuses it: a text box takes the cursor, another field the screen reader's
 * focus (P2-02). `still`: reduced motion is on, so the page jumps instead of scrolling smoothly (P2-09).
 */
function reveal(node: FieldNode, target: ScrollTarget | null, still: boolean) {
  const isTextBox = typeof (node as TextInput).isFocused === 'function';
  if (Platform.OS === 'web') {
    // react-native-web refs are the page's own elements.
    const element = node as unknown as HTMLElement;
    // An instant jump: a smooth scroll does not run in a page that is not drawing, and suits reduced motion.
    element.scrollIntoView?.({ block: 'center' });
    // A text box takes the cursor; another field takes the screen reader's focus when it can.
    // A tick, choice or box before a link (the privacy notice's link sits above its tick).
    const focusable = isTextBox
      ? element
      : (element.querySelector<HTMLElement>('[role="checkbox"], [role="radio"][tabindex="0"], input, select') ??
        element.querySelector<HTMLElement>('[tabindex="0"], button'));
    focusable?.focus({ preventScroll: true });
    return;
  }
  const scroll = target?.scroll.current;
  const content = target?.content.current;
  if (scroll && content) {
    node.measureLayout(
      content,
      (_x, y) => scroll.scrollTo({ y: Math.max(0, y - ABOVE), animated: !still }),
      () => undefined,
    );
  }
  // The keyboard opens; the page then keeps the box above it (components/keyboard.tsx).
  if (isTextBox) (node as TextInput).focus();
  // A date, a choice or a tick: TalkBack's focus goes to it, so its error is read next (#332).
  else moveFocusTo(node);
}

/** The fields of one form, and a way to take the person to the first one with a problem. */
export function useFormFocus<F extends string>() {
  const target = use(FormScrollContext);
  const still = useReducedMotion();
  const nodes = useRef(new Map<F, FieldNode>());
  const refs = useRef(new Map<F, (node: FieldNode | null) => void>());

  /** A ref for the field `key` (the same function every render). */
  const targetRef = useCallback((key: F) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (node: FieldNode | null) => {
        if (node) nodes.current.set(key, node);
        else nodes.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  /** Goes to the first field in `order` that has an error and is on the page. True when one was found. */
  const focusFirst = useCallback(
    (order: readonly F[], errors: Partial<Record<F, unknown>>) => {
      const key = order.find((k) => errors[k] && nodes.current.has(k));
      const node = key ? nodes.current.get(key) : undefined;
      if (!node) return false;
      // After the error messages are drawn, so the field is where it ends up. Not requestAnimationFrame:
      // it never fires in a page that is not drawing (a browser tab in the background).
      setTimeout(() => reveal(node, target, still), 0);
      return true;
    },
    [target, still],
  );

  /** Moves the cursor to the field `key` (the keyboard's Next button). */
  const focusField = useCallback((key: F) => {
    const node = nodes.current.get(key);
    if (node && typeof (node as TextInput).isFocused === 'function') (node as TextInput).focus();
  }, []);

  return { target: targetRef, focusFirst, focusField };
}
