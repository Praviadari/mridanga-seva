// Back, the swipe back and the header's back arrow ask "Discard what you typed?" while a form holds
// something not saved (audit phase 1 P1-10 / F5-05, docs/DECISIONS.md #327). Before, one slip threw away
// two minutes of a child's registration or a long announcement without a word. On the web a reload or
// closing the tab asks too (the browser's own question). A form calls allowLeave() just before it leaves
// by itself after a save, so a saved form is never questioned.
//
// Expo Router 57 has no usePreventRemove of its own (it comes in SDK 58); the one of the React Navigation
// it bundles is used (expo-router/react-navigation).

import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';

/**
 * True when `form` differs from what it held when it was first `ready` (an empty form, or a saved one
 * loaded for editing): what the leave guard protects.
 */
export function useFormChanged(form: unknown, ready: boolean): boolean {
  const [baseline, setBaseline] = useState<string | null>(null);
  const now = JSON.stringify(form);
  // Kept while rendering (React's "state from the previous render" pattern), not in an effect.
  if (ready && baseline === null) setBaseline(now);
  return baseline !== null && now !== baseline;
}

/** Asks before the screen is left while `dirty`; returns allowLeave() for a form that leaves after saving. */
export function useLeaveGuard(dirty: boolean): { allowLeave: () => void } {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const leaving = useRef(false);

  usePreventRemove(dirty, ({ data }) => {
    const go = () => {
      leaving.current = true;
      navigation.dispatch(data.action);
    };
    if (leaving.current) return go();
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('leaveGuard.title')}\n${t('leaveGuard.body')}`)) go();
      return;
    }
    Alert.alert(t('leaveGuard.title'), t('leaveGuard.body'), [
      { text: t('leaveGuard.keep'), style: 'cancel' },
      { text: t('leaveGuard.discard'), style: 'destructive', onPress: go },
    ]);
  });

  // The web: a reload or closing the tab while something is typed (the browser words the question).
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || typeof window === 'undefined') return;
    const ask = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  const allowLeave = useCallback(() => {
    leaving.current = true;
  }, []);
  return { allowLeave };
}
