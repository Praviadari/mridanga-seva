// On the web, the Space key ticks a tick box and picks a radio button, as on any web page.
// react-native-web presses a Pressable on Enter, but on Space only for buttons, so a keyboard user
// found tick boxes and choices dead to Space. Phones have no keyboard focus: nothing to add there.

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
