// Web stand-in for src/face/integrity.ts: the web app has no Play Integrity, so no self-scan (docs/DECISIONS.md
// #349). Keeps @expo/app-integrity out of the web bundle.

export const SELF_SCAN_SUPPORTED = false;

export class IntegrityNotConfigured extends Error {
  constructor() {
    super('not_configured');
  }
}

export async function integrityToken(_requestText: string): Promise<string> {
  throw new IntegrityNotConfigured();
}
