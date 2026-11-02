// The app's start file on Android and iOS: Expo Router's own, after the wake-up alarm's background task (Stop and
// Snooze with the app closed, lib/wake-alarm-task.ts, docs/DECISIONS.md #792), which must be defined before anything
// else runs. The web version starts from src/entry.web.tsx, which loads the staff and Guru screens only when they are
// opened (docs/DECISIONS.md #590). package.json "main" names this file without its ending, so each platform finds its
// own.

import './lib/wake-alarm-task';
import 'expo-router/entry';
