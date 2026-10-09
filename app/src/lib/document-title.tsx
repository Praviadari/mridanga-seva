// The browser tab's title on the web: the open screen's title and the app's name, e.g.
// "Attendance · Mridanga Seva", so tabs at the desk can be told apart and screen readers announce
// the page (WCAG 2.4.2). Expo Router turns React Navigation's own document title off, so every
// navigator passes `screenLayout={documentTitleLayout}`. Navigators nest (a stack around tabs), and
// each focused level has a title; the deepest one wins. Phones have no page title: nothing happens.

import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

// How deep the current navigator is: 0 at the root.
const Depth = createContext(0);

// The titles of the focused screens, by depth, each set by one screen. Only one screen per
// level is focused; the one losing focus may let go after the next one took its place.
const focused = new Map<number, { title: string }>();
let appName = '';

function writeTitle(): void {
  if (typeof document === 'undefined') return;
  const deepest = [...focused.entries()].sort(([a], [b]) => b - a).find(([, entry]) => entry.title.trim());
  document.title = deepest ? `${deepest[1].title} · ${appName}` : appName;
}

function DocumentTitle({ title, children }: { title: string | undefined; children: ReactNode }) {
  const depth = useContext(Depth);
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const name = t('app.name');
  useEffect(() => {
    if (!isFocused) return;
    appName = name;
    const entry = { title: title ?? '' };
    focused.set(depth, entry);
    writeTitle();
    return () => {
      if (focused.get(depth) === entry) focused.delete(depth);
      writeTitle();
    };
  }, [depth, isFocused, title, name]);
  return <Depth.Provider value={depth + 1}>{children}</Depth.Provider>;
}

/** `screenLayout` for a navigator: keeps the web page's title on the focused screen's title. */
export function documentTitleLayout({
  children,
  options,
}: {
  children: ReactElement;
  options: { title?: string };
}): ReactElement {
  if (Platform.OS !== 'web') return children;
  return <DocumentTitle title={options.title}>{children}</DocumentTitle>;
}
