// The web version's root component (docs/DECISIONS.md #590): what expo-router/build/qualified-entry renders, with this
// app's screen list in place of the one Expo Router builds. Kept apart from src/entry.web.tsx, as Expo Router keeps
// its own, so Fast Refresh does not reload the start file.

import { ExpoRoot } from 'expo-router';
import { Head } from 'expo-router/build/head';
import 'expo-router/build/fast-refresh';

import { routeContext } from './route-context';

/** The whole app on the web. */
export function App() {
  return (
    <Head.Provider>
      <ExpoRoot context={routeContext} />
    </Head.Provider>
  );
}
