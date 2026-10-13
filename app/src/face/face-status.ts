// Face scan (Phase 3 P3-4): the start check of the student area (docs/DECISIONS.md #310). At every start
// online, the phone asks the server whether face scan is on and whether THIS phone's enrolment is still
// current (my_face_enrolment), applies the wipe rule (src/face/enrolment.ts) and keeps the answer here for
// My profile (the "Face scan" row) and the home (the re-enrol prompt). Nothing happens on the web, where
// there is no face scan: the row stays hidden there.
//
// A module-level store (one signed-in person at a time), read with useFaceStatus().

import { useEffect, useSyncExternalStore } from 'react';

import { myFaceEnrolment } from '@/data/face';

import { applyWipeRule, type ServerFace, type StoredFace } from './enrolment';
import { FACE_SCAN_SUPPORTED, readStoredFace, wipeStoredFace, writeStoredFace } from './face-store';

export type FaceStatus = {
  /** The login this was checked for. */
  profileId: string;
  /** The server's answer; null = no answer (offline or refused). */
  server: ServerFace | null;
  /** What the phone keeps after the wipe rule. */
  stored: StoredFace | null;
  /** When this status was set (ms): the screens measure the code's and the enrolment's time against it. */
  checkedAt: number;
};

let status: FaceStatus | null = null;
const listeners = new Set<() => void>();

function publish(next: Omit<FaceStatus, 'checkedAt'> | null) {
  status = next && { ...next, checkedAt: Date.now() };
  for (const l of listeners) l();
}

/** The last start check, or null before it (or on the web). */
export function faceStatus(): FaceStatus | null {
  return status;
}

/** Sets the status after a screen changed the record (enrolled, turned off). */
export function setFaceStatus(next: Omit<FaceStatus, 'checkedAt'> | null): void {
  publish(next);
}

/**
 * Asks the server and applies the wipe rule. Never throws. Returns the new status (null on the web).
 * @param profileId the signed-in student's login.
 */
export async function checkFaceStatus(profileId: string): Promise<FaceStatus | null> {
  if (!FACE_SCAN_SUPPORTED) return null;
  try {
    const before = await readStoredFace();
    const { answer } = await myFaceEnrolment(before?.profileId === profileId ? before.deviceKey : null);
    const result = applyWipeRule(before, answer, profileId, Date.now());
    if (result.changed) await writeStoredFace(result.next);
    publish({ profileId, server: answer, stored: result.next });
    return status;
  } catch {
    return status;
  }
}

/** Deletes the face code on this phone and forgets the status (sign-out, src/lib/device-traces.ts). */
export async function forgetFace(): Promise<void> {
  publish(null);
  await wipeStoredFace();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The face status for this login; runs the start check once per login (and again on `recheck`).
 * @param profileId the signed-in student's login, or undefined while unknown.
 */
export function useFaceStatus(profileId: string | undefined): FaceStatus | null {
  const current = useSyncExternalStore(subscribe, faceStatus, faceStatus);
  useEffect(() => {
    if (profileId && faceStatus()?.profileId !== profileId) void checkFaceStatus(profileId);
  }, [profileId]);
  return current?.profileId === profileId ? current : null;
}
