// The web version's start file (docs/DECISIONS.md #590; audit 22-10-2026 fix 14): Expo Router's own start
// (expo-router/entry-classic) with one change, the list of screens it is given (web-routes/route-context.ts). The staff
// and Guru screens are not in the first download; they come as one file when someone signed in as staff opens them, so
// a student's phone downloads and reads only what a student uses. The phones keep Expo Router's own start (src/entry.ts).

// Must come first, as in Expo Router's own start file (Fast Refresh on the web).
import '@expo/metro-runtime';

import { renderRootComponent } from 'expo-router/build/renderRootComponent';

import { App } from '@/web-routes/app';

renderRootComponent(App);
