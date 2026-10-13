// Face scan (Phase 3 P3-4): the rules of the student's face code on the phone, kept free of React Native so
// tests/face-enrolment.test.mjs can drive them. Gate 2 (audit S4F-02, docs/DECISIONS.md #295): the face
// code exists ONLY here, in the phone's Keystore-encrypted store (src/face/face-store.ts); the server keeps
// an enrolment record and tells the phone whether it is still current (my_face_enrolment, migration 0070).
//
// What the phone keeps (StoredFace), for one login:
// - deviceKey: a random id made on this phone for this login (#309). The server ties the enrolment to it,
//   so a copy of the record on another phone is useless. Made with the first enrolment, gone with the wipe.
// - enrolled: the confirmed face code (mean of the enrolment pictures) and until when it is valid;
// - pending: a new face code waiting for the coordinator's confirmation (first enrolment or re-enrolment),
//   with the 6-digit code to show at the desk.
//
// The wipe rule (#310), run at every start of the student area with the server's answer, at sign-out
// (src/lib/device-traces.ts) and when the student turns face scan off:
// - another login's record, or a code made with another model → everything goes;
// - enrolled: kept only while the server says THIS phone's enrolment is current;
// - pending: kept while the server still waits on that request; promoted to enrolled when the server
//   already finished it (the app stopped between enrol_face and saving); otherwise dropped;
// - without an answer (no internet) nothing is decided, except a pending older than an hour (the server
//   has ended it by then).

import { FACE_MODEL_VERSION, PENDING_MAX_MS } from './face-settings';

/** One face code on the phone. `mean` = base64 of 128 float32 (face-math floatsToBase64), L2-normalised. */
export type FacePart = {
  /** face_enrolments.id of the request this code was made for. */
  request: number;
  mean: string;
  /** How many pictures the mean was made from. */
  frames: number;
  /** When the pictures were taken (ISO). */
  createdAt: string;
  /** Enrolled: until when the server keeps the enrolment (ISO). */
  expiresAt?: string | null;
  /** Pending: the 6-digit code the coordinator types, and until when the server accepts it (ISO). */
  code?: string;
  codeExpiresAt?: string;
};

export type StoredFace = {
  v: 1;
  /** The login (profiles.id) this belongs to; never used for another login. */
  profileId: string;
  deviceKey: string;
  /** FACE_MODEL_VERSION when the codes were made. */
  model: string;
  enrolled: FacePart | null;
  pending: FacePart | null;
};

/** The answer of my_face_enrolment(device_key) (migration 0070). */
export type ServerFace = {
  face_enabled: boolean;
  model_version: string | null;
  /** True when the student's current enrolment is THIS login on THIS phone (device_key). */
  enrolled: boolean;
  expires_at: string | null;
  /** The id of this phone's request that waits for the coordinator, if any. */
  waiting_request: number | null;
  /** True when the coordinator has typed the code of that request. */
  confirmed: boolean;
};

/** Reads my_face_enrolment's JSON into ServerFace; null when it does not look like one. */
export function readServerFace(data: unknown): ServerFace | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.face_enabled !== 'boolean') return null;
  return {
    face_enabled: d.face_enabled,
    model_version: typeof d.model_version === 'string' ? d.model_version : null,
    enrolled: d.enrolled === true,
    expires_at: typeof d.expires_at === 'string' ? d.expires_at : null,
    waiting_request: typeof d.waiting_request === 'number' ? d.waiting_request : null,
    confirmed: d.confirmed === true,
  };
}

/** The server's device_key rule: 16-100 of A-Z a-z 0-9 _ -. */
export function isDeviceKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{16,100}$/.test(key);
}

/** A device key from 24 random bytes (base64url, 32 characters). */
export function deviceKeyFrom(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('device key needs at least 16 random bytes');
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += abc[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** What the wipe rule decided, and why (the why is for the dev screen and the tests, never sent anywhere). */
export type WipeResult = {
  /** The record to keep; null = delete everything on the phone. */
  next: StoredFace | null;
  /** True when `next` differs from what was stored (so it must be written). */
  changed: boolean;
  reason: 'nothing' | 'kept' | 'otherLogin' | 'model' | 'ended' | 'requestEnded' | 'promoted' | 'stalePending' | 'synced';
};

/**
 * The wipe rule (top of this file).
 * @param stored what the phone keeps now (null = nothing).
 * @param server my_face_enrolment's answer for stored.deviceKey; null = no answer (offline, error).
 * @param profileId the signed-in login.
 * @param now ms since 1970.
 */
export function applyWipeRule(stored: StoredFace | null, server: ServerFace | null, profileId: string, now: number): WipeResult {
  if (!stored) return { next: null, changed: false, reason: 'nothing' };
  if (stored.profileId !== profileId) return { next: null, changed: true, reason: 'otherLogin' };
  if (stored.model !== FACE_MODEL_VERSION) return { next: null, changed: true, reason: 'model' };
  if (!server) {
    const p = stored.pending;
    if (p && now - Date.parse(p.createdAt) > PENDING_MAX_MS) return finish(stored, { ...stored, pending: null }, 'stalePending');
    return { next: stored, changed: false, reason: 'kept' };
  }
  if (server.model_version !== null && server.model_version !== stored.model) return { next: null, changed: true, reason: 'model' };

  let enrolled = stored.enrolled;
  let pending = stored.pending;
  let reason: WipeResult['reason'] = 'kept';

  if (pending && server.waiting_request !== pending.request) {
    // The request no longer waits. If the server shows a current enrolment for this phone that is not the
    // one kept as enrolled (another end date, or none kept), enrol_face finished it: promote.
    const isNew = server.enrolled && (!enrolled || (server.expires_at !== null && server.expires_at !== enrolled.expiresAt));
    if (isNew) {
      enrolled = { request: pending.request, mean: pending.mean, frames: pending.frames, createdAt: pending.createdAt, expiresAt: server.expires_at };
      reason = 'promoted';
    } else {
      reason = 'requestEnded';
    }
    pending = null;
  }
  if (enrolled && !server.enrolled) {
    enrolled = null;
    reason = 'ended';
  } else if (enrolled && server.expires_at && enrolled.expiresAt !== server.expires_at && reason === 'kept') {
    enrolled = { ...enrolled, expiresAt: server.expires_at };
    reason = 'synced';
  }
  return finish(stored, { ...stored, enrolled, pending }, reason);
}

function finish(before: StoredFace, after: StoredFace, reason: WipeResult['reason']): WipeResult {
  if (!after.enrolled && !after.pending) return { next: null, changed: true, reason };
  const changed = after.enrolled !== before.enrolled || after.pending !== before.pending;
  return { next: after, changed, reason: changed ? reason : 'kept' };
}

/**
 * The record after a good scan: the new face code waits for the coordinator (pending); an enrolled one
 * (re-enrolment) stays until the server confirms the new one. Another login's record is not carried over.
 */
export function withPending(
  stored: StoredFace | null,
  profileId: string,
  deviceKey: string,
  started: { request: number; code: string; expiresAt: string },
  mean: string,
  frames: number,
  now: number,
): StoredFace {
  const own = stored && stored.profileId === profileId && stored.model === FACE_MODEL_VERSION ? stored : null;
  return {
    v: 1,
    profileId,
    deviceKey,
    model: FACE_MODEL_VERSION,
    enrolled: own?.enrolled ?? null,
    pending: { request: started.request, mean, frames, createdAt: new Date(now).toISOString(), code: started.code, codeExpiresAt: started.expiresAt },
  };
}

/** The record after enrol_face: the pending code becomes the enrolled one (the old phone's ends on the server). */
export function withEnrolled(stored: StoredFace, expiresAt: string | null): StoredFace {
  const p = stored.pending;
  if (!p) return stored;
  return { ...stored, enrolled: { request: p.request, mean: p.mean, frames: p.frames, createdAt: p.createdAt, expiresAt }, pending: null };
}

/** The record without its pending code (stopped, ran out, refused); null when nothing is left. */
export function withoutPending(stored: StoredFace | null): StoredFace | null {
  if (!stored) return null;
  return stored.enrolled ? { ...stored, pending: null } : null;
}

/** True when an enrolment ending at `expiresAt` should prompt a re-enrolment (within `days` days). */
export function expiresSoon(expiresAt: string | null | undefined, now: number, days: number): boolean {
  if (!expiresAt) return false;
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) && end - now <= days * 24 * 60 * 60 * 1000;
}

/** What the student's Face scan screen shows. */
export type FaceView =
  /** Face scan is switched off for the class and this phone keeps no face code: nothing to do. */
  | { kind: 'off' }
  /** No face scan on this phone: explain, offer "Turn on face scan". */
  | { kind: 'intro' }
  /** A new face code waits for the coordinator: show the code (or say it ran out). */
  | { kind: 'code'; request: number; code: string | null; expired: boolean; confirmed: boolean; reEnrol: boolean }
  /** Face scan is on for this phone. `classOff`: the class switch is off (no self-scan now; turning off still works). */
  | { kind: 'on'; expiresAt: string | null; soon: boolean; classOff: boolean };

/**
 * The screen's state from what the phone keeps (after the wipe rule) and the server's answer.
 * @param server null = no answer: the phone's own record decides (shown with a no-internet note).
 */
export function faceView(stored: StoredFace | null, server: ServerFace | null, now: number, promptDays: number): FaceView {
  const on = server?.face_enabled ?? true;
  if (stored?.pending && on) {
    const p = stored.pending;
    const confirmed = server?.confirmed === true && server.waiting_request === p.request;
    const expired = !confirmed && (!p.codeExpiresAt || Date.parse(p.codeExpiresAt) <= now);
    return { kind: 'code', request: p.request, code: p.code ?? null, expired, confirmed, reEnrol: stored.enrolled !== null };
  }
  if (stored?.enrolled) {
    const expiresAt = stored.enrolled.expiresAt ?? null;
    return { kind: 'on', expiresAt, soon: on && expiresSoon(expiresAt, now, promptDays), classOff: !on };
  }
  return on ? { kind: 'intro' } : { kind: 'off' };
}

/** One analysed enrolment picture, as the pipeline gives it. */
export type EnrolSample = { embedding: Float32Array; realScore: number };

/** Why a set of enrolment pictures is not good enough, or null when it is. */
export type QualityProblem = 'tooFew' | 'notReal' | 'notOneFace';

/**
 * Checks the enrolment pictures (#311): enough of them, every one scored as a real face, and all of the
 * same face (each close to their mean). `cosineToMean` is face-math's cosine against the mean.
 */
export function enrolmentProblem(
  samples: readonly EnrolSample[],
  limits: { minFrames: number; liveMin: number; selfMin: number },
  cosineToMean: (embedding: Float32Array) => number,
): QualityProblem | null {
  if (samples.length < limits.minFrames) return 'tooFew';
  if (samples.some((s) => !(s.realScore >= limits.liveMin))) return 'notReal';
  if (samples.some((s) => !(cosineToMean(s.embedding) >= limits.selfMin))) return 'notOneFace';
  return null;
}
