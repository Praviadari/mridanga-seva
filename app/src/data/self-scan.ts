// Face self-scan (Phase 3 P3-5 + P3-6 app half, docs/DECISIONS.md #344-#349): the server calls of the student's
// own check-in / check-out (migration 0071 and 0070's integrity check). Order of one self-scan:
//   fetchSelfScanState (the home's circle) → [one position, the face scan on the phone] →
//   issueChallenge → (Play Integrity token, src/face/integrity.ts) → verifyIntegrity (Edge Function) →
//   selfScan (spends the pass; the server re-checks everything) — or noteSelfScanFailure when the phone
//   refuses first (outside, mocked, liveness, no match). No face code and no position is kept by the server.

import { FunctionsHttpError } from '@supabase/supabase-js';

import { readSelfScanOutcome, readSelfScanState, type LocationResult, type PhonePosition, type SelfScanAction, type SelfScanOutcome, type SelfScanState } from '@/face/self-scan-rules';
import { supabase } from '@/lib/supabase';

import { isNetworkError, type MessageKey } from './errors';
import { faceErrorCode, faceErrorKey, type FaceErrorCode } from './face';

type Failed = { errorKey: MessageKey; code: FaceErrorCode | null; offline: boolean };

function failed(message: string): Failed {
  return { errorKey: faceErrorKey(message), code: faceErrorCode(message), offline: isNetworkError(message) };
}

/** self_scan_state: what the home's circle shows for this phone. Null = could not ask (offline or refused). */
export async function fetchSelfScanState(deviceKey: string): Promise<SelfScanState | null> {
  const { data, error } = await supabase.rpc('self_scan_state', { p_device_key: deviceKey });
  if (error) return null;
  return readSelfScanState(data);
}

/** issue_integrity_challenge (0070): a single-use challenge for this action, 60 s, and the login it is for. */
export async function issueChallenge(action: SelfScanAction): Promise<{ challenge: string; login: string } | Failed> {
  const { data, error } = await supabase.rpc('issue_integrity_challenge', { p_action: action });
  if (error) return failed(error.message);
  const d = (data ?? {}) as { challenge?: unknown; login?: unknown };
  if (typeof d.challenge !== 'string' || typeof d.login !== 'string') return failed('');
  return { challenge: d.challenge, login: d.login };
}

/** The Edge Function's answer: a one-time pass, or why not (its reason, and the verdict rule that failed). */
export type IntegrityAnswer = { pass: string } | { reason: string; rule: string | null; offline: boolean };

/** verify-integrity (0070's Edge Function): spends the challenge, checks Google's verdict, gives a pass for 120 s. */
export async function verifyIntegrity(input: { challenge: string; token: string; action: SelfScanAction; location: LocationResult }): Promise<IntegrityAnswer> {
  const { data, error } = await supabase.functions.invoke('verify-integrity', { body: input });
  let body: unknown = data;
  if (error) {
    // A 4xx/5xx answer still carries the function's own { ok: false, reason }.
    if (error instanceof FunctionsHttpError) {
      body = await (error.context as Response).json().catch(() => null);
    } else {
      return { reason: 'server_error', rule: null, offline: true };
    }
  }
  const b = (body ?? {}) as { ok?: unknown; pass?: unknown; reason?: unknown; rule?: unknown };
  if (b.ok === true && typeof b.pass === 'string') return { pass: b.pass };
  return { reason: typeof b.reason === 'string' ? b.reason : 'server_error', rule: typeof b.rule === 'string' ? b.rule : null, offline: false };
}

export type SelfScanInput = {
  action: SelfScanAction;
  position: PhonePosition;
  pass: string;
  deviceKey: string;
  livenessOk: boolean;
  matchScore: number;
};

/** self_scan (0071): saves the check-in / check-out, or answers why not. Raised codes come back as Failed. */
export async function selfScan(input: SelfScanInput): Promise<{ outcome: SelfScanOutcome } | Failed> {
  const { data, error } = await supabase.rpc('self_scan', {
    p_action: input.action,
    p_location: input.position,
    p_pass: input.pass,
    p_device_key: input.deviceKey,
    p_liveness_ok: input.livenessOk,
    p_match_score: input.matchScore,
  });
  if (error) return failed(error.message);
  const outcome = readSelfScanOutcome(data);
  return outcome ? { outcome } : failed('');
}

/** note_self_scan_failure (0071): counts a self-scan the phone refused, per centre and reason (no name). Never throws. */
export async function noteSelfScanFailure(reason: 'outside' | 'mocked' | 'liveness' | 'no_match', detail: string | null = null): Promise<void> {
  await supabase.rpc('note_self_scan_failure', { p_reason: reason, p_detail: detail }).then(
    () => undefined,
    () => undefined,
  );
}
