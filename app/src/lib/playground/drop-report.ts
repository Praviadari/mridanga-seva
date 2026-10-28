// Reports challenges the check dropped (docs/RHYTHM_PLAYGROUND.md §8.5, §13.3; #723) to App errors (client_errors,
// 0061): the reason, exercise, template and content version only (data/playground.ts dropErrorName) — never the
// student, the seed or an answer. Quiet: the error log's own limits apply and a failure is never shown. A separate
// file because it needs the running app version (expo-constants), which the engine's tests cannot load.

import { Platform } from 'react-native';

import { sendErrorReport } from '@/data/app-errors';
import { dropErrorName } from '@/data/playground';
import { runningVersion } from '@/lib/app-update';
import { platformOf, versionTag } from '@/lib/error-report-rules';

import type { DroppedChallenge } from './types';

/** Sends one report per distinct dropped challenge of a round. Never throws. */
export async function reportDroppedChallenges(drops: readonly DroppedChallenge[], contentVersion: number): Promise<void> {
  const platform = platformOf(Platform.OS);
  if (!platform || drops.length === 0) return;
  const version = versionTag(runningVersion());
  const names = new Set(drops.map((drop) => dropErrorName(drop, contentVersion)));
  for (const errorName of names) {
    await sendErrorReport({ kind: 'unhandled', errorName, screen: '/student/playground', version, platform });
  }
}
