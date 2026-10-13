// Face self-scan (Phase 3 P3-6 app half, docs/DECISIONS.md #349): the phone's half of Gate 1 (0060, #296). For
// each check-in / check-out: the server's single-use challenge → a Play Integrity token whose requestHash is the
// SHA-256 of 0060's request text (login, action, challenge, location result) → the Edge Function
// verify-integrity, which has Google decode it and answers a one-time pass that self_scan spends. Android only
// (Play Integrity); integrity.web.ts stands in on the web, and iOS gets no self-scan (WORK_PLAN §4).
// Native module: @expo/app-integrity (alpha, pinned since P3-3), from the spike's Gate 1 tab.

import * as AppIntegrity from '@expo/app-integrity';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { PLAY_INTEGRITY_CLOUD_PROJECT } from './face-settings';

/** True where the self-scan can run: the Android app (Play Integrity). */
export const SELF_SCAN_SUPPORTED = Platform.OS === 'android';

/** Thrown when the app carries no Cloud project number yet (face-settings.ts): "Ask a coordinator". */
export class IntegrityNotConfigured extends Error {
  constructor() {
    super('not_configured');
  }
}

let preparedFor: string | null = null;

async function prepare(project: string): Promise<void> {
  if (preparedFor === project) return;
  await AppIntegrity.prepareIntegrityTokenProviderAsync(project);
  preparedFor = project;
}

/**
 * A Play Integrity token bound to one request text (selfScanRequestText). Prepares the token provider once; a
 * provider that has gone stale (ERR_APP_INTEGRITY_PROVIDER_INVALID) is prepared again and asked once more.
 * Throws IntegrityNotConfigured, or Play's own error (no Play Store, no network ...).
 */
export async function integrityToken(requestText: string): Promise<string> {
  const project = PLAY_INTEGRITY_CLOUD_PROJECT;
  if (!/^\d{6,20}$/.test(project)) throw new IntegrityNotConfigured();
  const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, requestText);
  await prepare(project);
  try {
    return await AppIntegrity.requestIntegrityCheckAsync(requestHash);
  } catch {
    preparedFor = null;
    await prepare(project);
    return AppIntegrity.requestIntegrityCheckAsync(requestHash);
  }
}
