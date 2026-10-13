// Face scan (Phase 3 P3-4): where the phone keeps the student's face code — the ONLY copy anywhere (Gate 2,
// docs/DECISIONS.md #295, #308). expo-secure-store encrypts it with a key held in the Android Keystore
// (SPIKE_RESULT §7: chosen over SQLCipher); allowBackup stays false, so it never leaves the phone in a
// backup. One record per phone (src/face/enrolment.ts StoredFace): the face code is 128 numbers, never a
// picture. Web: src/face/face-store.web.ts (no face scan on the web).

import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { deviceKeyFrom, type StoredFace } from './enrolment';

const KEY = 'face.v1';
// WHEN_UNLOCKED_THIS_DEVICE_ONLY: on iOS the item never moves to another device through a keychain backup.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** The record kept on this phone, or null (also when it cannot be read: then it is deleted). */
export async function readStoredFace(): Promise<StoredFace | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFace;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    // Damaged or its Keystore key is gone (e.g. the phone's lock was reset): nothing usable is left.
    await wipeStoredFace();
    return null;
  }
}

/** Saves the record; null deletes it. */
export async function writeStoredFace(face: StoredFace | null): Promise<void> {
  if (!face) {
    await wipeStoredFace();
    return;
  }
  await SecureStore.setItemAsync(KEY, JSON.stringify(face), OPTIONS);
}

/** Deletes the face code from this phone. Never throws. True when something was there. */
export async function wipeStoredFace(): Promise<boolean> {
  try {
    const had = (await SecureStore.getItemAsync(KEY, OPTIONS)) !== null;
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
    return had;
  } catch {
    try {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
    } catch {
      // nothing to delete
    }
    return false;
  }
}

/** A new random device key (#309): 24 random bytes, base64url. */
export function newDeviceKey(): string {
  return deviceKeyFrom(getRandomBytes(24));
}

/** True on a platform that can run the face scan (Android/iOS with the native packages). */
export const FACE_SCAN_SUPPORTED = true;
