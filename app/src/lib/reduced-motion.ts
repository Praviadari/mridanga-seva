// Whether the person asked their phone or browser for less motion: Android's "Remove animations", or the
// browser's prefers-reduced-motion (audit phase 4 P2-09, docs/DECISIONS.md #332). The app's few movements
// (the loading shapes' fade, the drop-down list's fade, the scroll to a field with a problem) then stop.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The browser's setting now; false where it cannot be read. */
function webReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** True while the phone or browser asks for reduced motion; follows changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (Platform.OS === 'web' ? webReduced() : false));
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      const media = window.matchMedia(QUERY);
      const onChange = () => setReduced(media.matches);
      media.addEventListener?.('change', onChange);
      return () => media.removeEventListener?.('change', onChange);
    }
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (live) setReduced(on);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
