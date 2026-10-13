// Web stand-in for src/face/face-store.ts: the web app has no face scan (no models, no Keystore), so it
// keeps no face code and never asks the server about one (docs/DECISIONS.md #308).

import type { StoredFace } from './enrolment';

export async function readStoredFace(): Promise<StoredFace | null> {
  return null;
}

export async function writeStoredFace(_face: StoredFace | null): Promise<void> {}

export async function wipeStoredFace(): Promise<boolean> {
  return false;
}

export function newDeviceKey(): string {
  throw new Error('No face scan on the web');
}

export const FACE_SCAN_SUPPORTED = false;
