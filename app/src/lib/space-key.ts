// On the web, the Space key ticks a tick box and picks a radio button, as on any web page.
// react-native-web presses a Pressable on Enter, but on Space only for buttons, so a keyboard user
// found tick boxes and choices dead to Space. Phones have no keyboard focus: nothing to add there.
// A group of radio buttons also follows the web's radio-group pattern (useRadioKeys, docs/DECISIONS.md
// #221): Tab reaches the group once, at its chosen button, and the arrow keys move inside it.

import { useRef } from 'react';
import { Platform } from 'react-native';

type KeyEvent = { key?: string; preventDefault?: () => void };

/**
 * Props to spread on a Pressable with the role 'checkbox' or 'radio': on the web, Space runs
 * `action` (and does not scroll the page). An empty object on phones.
 */
export function spaceKeyProps(action: () => void): { onKeyDown?: (event: KeyEvent) => void } {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (event) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault?.();
      action();
    },
  };
}

/** Which way an arrow key moves in a radio group: +1 next, -1 previous; undefined for other keys. */
export function arrowStep(key: string | undefined): 1 | -1 | undefined {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  return undefined;
}

/** The button an arrow key moves to from `index` in a group of `count`, going round at the ends. */
export function nextIndex(index: number, step: 1 | -1, count: number): number {
  return (index + step + count) % count;
}

/** Something that can take the keyboard focus: a Pressable's element on the web. */
type Focusable = { focus?: () => void } | null;

/** The props useRadioKeys gives each button: empty on phones. */
export type RadioKeyProps = {
  ref?: (node: Focusable) => void;
  tabIndex?: 0 | -1;
  onKeyDown?: (event: KeyEvent) => void;
};

/**
 * Keyboard handling for a group of radio buttons on the web: only the chosen button (the first when
 * none is chosen) is in the Tab order; Space picks the focused one; the arrow keys move the focus to the
 * next or previous button, round at the ends, and pick it too unless `pickOnArrow` is false (a list in a
 * dialog that closes when something is picked). Returns the props for the button at an index.
 * @param count how many buttons the group has.
 * @param chosen the index of the chosen button, or -1 for none.
 * @param pick picks the button at an index.
 */
export function useRadioKeys(
  count: number,
  chosen: number,
  pick: (index: number) => void,
  pickOnArrow = true,
): (index: number) => RadioKeyProps {
  const nodes = useRef<Focusable[]>([]);
  if (Platform.OS !== 'web') return () => ({});
  const tabStop = chosen >= 0 && chosen < count ? chosen : 0;
  return (index) => ({
    ref: (node) => {
      nodes.current[index] = node;
    },
    tabIndex: index === tabStop ? 0 : -1,
    onKeyDown: (event) => {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault?.();
        pick(index);
        return;
      }
      const step = arrowStep(event.key);
      if (!step || count < 2) return;
      event.preventDefault?.();
      const next = nextIndex(index, step, count);
      if (pickOnArrow) pick(next);
      nodes.current[next]?.focus?.();
    },
  });
}
