// Face scan (Phase 3 P3-4): the server calls of the enrolment at the desk (migration 0070, docs/DECISIONS.md
// #295-#300 for the server, #307-#312 for the app). No face code is ever sent: the server keeps only the
// enrolment record (Gate 2, #295). Every call answers { errorKey } on a refusal, worded per server code
// in en/te/hi under face.errors.* (faceErrorKey).
//
// Student's phone: myFaceEnrolment (every start of the student area), startFaceEnrolment → (scan on the
// phone) → the coordinator confirms → enrolFace; turnMyFaceOff.
// Staff at the desk: fetchFaceSwitch, recordFaceConsent, approveFaceEnrolment, removeFaceAtDesk,
// fetchFaceEnrolments (written to the access log by the server).

import { supabase } from '@/lib/supabase';

import { readServerFace, type ServerFace } from '@/face/enrolment';

import { fallbackErrorKey, type MessageKey } from './errors';

/**
 * Every refusal code of the face functions and the integrity check (0070 and the Edge Function
 * verify-integrity), each worded in face.errors.<code>. The integrity codes are used by the self-scan
 * (P3-5); they are listed here so all of them are worded at once.
 */
export const FACE_ERROR_CODES = [
  // Switch, age, consent (record_face_consent, face_block_reason).
  'face_off',
  'face_too_young',
  'no_face_consent',
  'face_consent_at_desk',
  'face_consent_exists',
  'child_assent_required',
  'written_consent_required',
  'notice_version_invalid',
  'dob_required',
  'minor_needs_guardian',
  'minor_needs_id_check',
  'consent_guardian_mismatch',
  'student_left',
  'student_not_found',
  // Enrolment (start_face_enrolment, approve_face_enrolment, enrol_face, my_face_enrolment, remove_face).
  'device_key_invalid',
  'face_model_outdated',
  'too_many_requests',
  'no_face_request',
  'face_request_expired',
  'face_not_confirmed',
  'face_confirmation_expired',
  'device_mismatch',
  'face_not_enrolled',
  'student_required',
  'reason_invalid',
  'not_allowed',
  // Settings and visits (guard_setting, guard_face_visit) and the staff counts (face_use_counts).
  'setting_owner_only',
  'face_visit_reserved',
  'range_invalid',
  'range_too_long',
  // Integrity check (issue_integrity_challenge, use_integrity_pass, verify-integrity).
  'action_invalid',
  'integrity_required',
  'integrity_pass_used',
  'integrity_pass_expired',
  'integrity_pass_mismatch',
  'integrity_failed',
  'challenge_expired',
  'challenge_used',
  'challenge_unknown',
  'challenge_not_yours',
  'challenge_not_open',
  'action_mismatch',
  'location_invalid',
  'not_configured',
  'bad_request',
  'server_error',
  // The self-scan (self_scan, 0071): a position the server cannot read.
  'bad_location',
] as const;

export type FaceErrorCode = (typeof FACE_ERROR_CODES)[number];

/**
 * The message for a face call's error. `message` is supabase-js's error message, which is the server's
 * code (raise exception 'face_off'); student_withdrawn, no internet and anything else use the shared words.
 * @param context 'approve': not_allowed there means "your own record" (approve_face_enrolment).
 */
export function faceErrorKey(message: string, context?: 'approve'): MessageKey {
  if (context === 'approve' && message === 'not_allowed') return 'face.errors.confirmOwn';
  if ((FACE_ERROR_CODES as readonly string[]).includes(message)) return `face.errors.${message as FaceErrorCode}`;
  return fallbackErrorKey(message);
}

/** The code inside an error, for screens that act on it (e.g. no_face_consent shows how to give consent). */
export function faceErrorCode(message: string): FaceErrorCode | null {
  return (FACE_ERROR_CODES as readonly string[]).includes(message) ? (message as FaceErrorCode) : null;
}

type Failed = { errorKey: MessageKey; code: FaceErrorCode | null };

function failed(message: string, context?: 'approve'): Failed {
  return { errorKey: faceErrorKey(message, context), code: faceErrorCode(message) };
}

// ---------------------------------------------------------------- the student's phone

/** my_face_enrolment: is face scan on, and is this phone's enrolment current? Null answer = could not ask. */
export async function myFaceEnrolment(deviceKey: string | null): Promise<{ answer: ServerFace | null } & Partial<Failed>> {
  const { data, error } = await supabase.rpc('my_face_enrolment', { p_device_key: deviceKey });
  if (error) return { answer: null, ...failed(error.message) };
  const answer = readServerFace(data);
  return answer ? { answer } : { answer: null, ...failed('') };
}

export type StartedEnrolment = { request: number; code: string; expiresAt: string };

/** start_face_enrolment: asks to enrol this phone; the answer's 6-digit code is shown to the coordinator. */
export async function startFaceEnrolment(deviceKey: string, model: string): Promise<{ started: StartedEnrolment } | Failed> {
  const { data, error } = await supabase.rpc('start_face_enrolment', { p_device_key: deviceKey, p_model_version: model });
  if (error) return failed(error.message);
  const d = (data ?? {}) as { request?: unknown; code?: unknown; expires_at?: unknown };
  if (typeof d.request !== 'number' || typeof d.code !== 'string' || typeof d.expires_at !== 'string') return failed('');
  return { started: { request: d.request, code: d.code, expiresAt: d.expires_at } };
}

/** enrol_face: after the coordinator's confirmation, records the enrolment of this phone. */
export async function enrolFace(request: number, deviceKey: string): Promise<{ expiresAt: string | null } | Failed> {
  const { data, error } = await supabase.rpc('enrol_face', { p_request: request, p_device_key: deviceKey });
  if (error) return failed(error.message);
  const d = (data ?? {}) as { expires_at?: unknown };
  return { expiresAt: typeof d.expires_at === 'string' ? d.expires_at : null };
}

/** remove_face for oneself: face scan off, one tap; the face consent ends too (the server's rule, #297). */
export async function turnMyFaceOff(): Promise<{ ok: true } | Failed> {
  const { error } = await supabase.rpc('remove_face', {});
  return error ? failed(error.message) : { ok: true };
}

// ---------------------------------------------------------------- staff at the desk

/**
 * Whether face scan is switched on for the class (setting face_enabled; staff may read settings).
 * False when the setting does not exist (before migration 0070) or cannot be read: the face screens stay hidden.
 */
export async function fetchFaceSwitch(): Promise<boolean> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'face_enabled').maybeSingle();
  if (error) return false;
  return (data as { value: unknown } | null)?.value === true;
}

export type DeskGuardian = { id: string; fullName: string; relation: string | null };

/**
 * What the desk needs before recording a face consent: the current face consent (when it was given; null =
 * none), and for a minor the parents to pick from. Read through get_consents and get_guardians (0034), which
 * write each read to the access log. Null = could not load.
 */
export async function fetchFaceDesk(studentId: string, minor: boolean): Promise<{ consentGivenAt: string | null; guardians: DeskGuardian[] } | null> {
  const [consents, guardians] = await Promise.all([
    supabase.rpc('get_consents', { p_student: studentId }),
    minor ? supabase.rpc('get_guardians', { p_student: studentId }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (consents.error || guardians.error) return null;
  const face = ((consents.data ?? []) as { scope: string; given_at: string; revoked_at: string | null }[]).find(
    (c) => c.scope === 'face' && !c.revoked_at,
  );
  return {
    consentGivenAt: face?.given_at ?? null,
    guardians: ((guardians.data ?? []) as { id: string; full_name: string; relation: string | null }[]).map((g) => ({
      id: g.id,
      fullName: g.full_name,
      relation: g.relation,
    })),
  };
}

export type FaceConsentInput = {
  signedForm: boolean;
  /** A minor: the parent who signed, the parent's ID that was seen, and the child's own yes. */
  guardianId?: string | null;
  idTypeChecked?: string | null;
  childAssent?: boolean;
};

/** record_face_consent: the signed face consent form, recorded at the desk. */
export async function recordFaceConsent(studentId: string, input: FaceConsentInput): Promise<{ ok: true } | Failed> {
  const { error } = await supabase.rpc('record_face_consent', {
    p_student: studentId,
    p_signed_form: input.signedForm,
    p_guardian: input.guardianId ?? null,
    p_id_type_checked: input.idTypeChecked ?? null,
    p_child_assent: input.childAssent ?? null,
  });
  return error ? failed(error.message) : { ok: true };
}

export type ApproveResult =
  | { state: 'confirmed'; rollNo: string | null; fullName: string; repeated: boolean }
  | { state: 'wrongCode'; triesLeft: number };

/** approve_face_enrolment: the coordinator types the code shown on the student's phone. */
export async function approveFaceEnrolment(studentId: string, code: string): Promise<ApproveResult | Failed> {
  const { data, error } = await supabase.rpc('approve_face_enrolment', { p_student: studentId, p_code: code.trim() });
  if (error) return failed(error.message, 'approve');
  const d = (data ?? {}) as { ok?: unknown; tries_left?: unknown; roll_no?: unknown; full_name?: unknown; repeated?: unknown };
  if (d.ok === true) {
    return {
      state: 'confirmed',
      rollNo: typeof d.roll_no === 'string' ? d.roll_no : null,
      fullName: typeof d.full_name === 'string' ? d.full_name : '',
      repeated: d.repeated === true,
    };
  }
  if (d.ok === false) return { state: 'wrongCode', triesLeft: typeof d.tries_left === 'number' ? d.tries_left : 0 };
  return failed('');
}

/** remove_face by staff: 'desk' = the student or parent says no (consent ends); 'lost_phone' = consent stays. */
export async function removeFaceAtDesk(studentId: string, reason: 'desk' | 'lost_phone'): Promise<{ removed: number; consentRevoked: boolean } | Failed> {
  const { data, error } = await supabase.rpc('remove_face', { p_student: studentId, p_reason: reason });
  if (error) return failed(error.message);
  const d = (data ?? {}) as { removed?: unknown; consent_revoked?: unknown };
  return { removed: typeof d.removed === 'number' ? d.removed : 0, consentRevoked: d.consent_revoked === true };
}

export type FaceEnrolmentState = 'waiting_code' | 'confirmed' | 'current' | 'expired' | 'ended';

export type FaceEnrolmentRow = {
  id: number;
  state: FaceEnrolmentState;
  requestedAt: string;
  enrolledAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

/** face_scan_failures' reasons (0070, 0071), in the order the staff counts list them. */
export const FACE_FAILURE_REASONS = ['outside', 'mocked', 'window', 'integrity', 'liveness', 'no_match', 'not_enrolled', 'offline', 'other'] as const;
export type FaceFailureReason = (typeof FACE_FAILURE_REASONS)[number];

/** One centre in the staff counts (C27): numbers only, no student is named (#213, Guru item 11). */
export type FaceUseCounts = {
  centreId: number;
  centre: string;
  /** Students with a current face enrolment. */
  enrolled: number;
  /** Failed self-scans in the period, by reason. */
  failures: Partial<Record<FaceFailureReason, number>>;
  /** The integrity failures by the rule that failed (verify-integrity's codes, use_integrity_pass's). */
  integrity: Record<string, number>;
};

const counts = (v: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(v && typeof v === 'object' ? (v as Record<string, unknown>) : {}).filter((e): e is [string, number] => typeof e[1] === 'number'),
  );

/** face_use_counts (P3-6): per centre (a coordinator: their own; the Guru: every active centre), from - to (days at the class). */
export async function fetchFaceUseCounts(from: string, to: string): Promise<{ centres: FaceUseCounts[] } | Failed> {
  const { data, error } = await supabase.rpc('face_use_counts', { p_from: from, p_to: to });
  if (error) return failed(error.message);
  const centres = ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).map((c) => ({
    centreId: Number(c.centre_id),
    centre: String(c.centre ?? ''),
    enrolled: Number(c.enrolled ?? 0),
    failures: counts(c.failures) as Partial<Record<FaceFailureReason, number>>,
    integrity: counts(c.integrity),
  }));
  return { centres };
}

/** get_face_enrolments: the student's enrolments, newest first (the server writes one access-log row). */
export async function fetchFaceEnrolments(studentId: string): Promise<{ rows: FaceEnrolmentRow[] } | Failed> {
  const { data, error } = await supabase.rpc('get_face_enrolments', { p_student: studentId });
  if (error) return failed(error.message);
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    state: String(r.state) as FaceEnrolmentState,
    requestedAt: String(r.requested_at),
    enrolledAt: typeof r.enrolled_at === 'string' ? r.enrolled_at : null,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : null,
    revokedAt: typeof r.revoked_at === 'string' ? r.revoked_at : null,
    revokeReason: typeof r.revoke_reason === 'string' ? r.revoke_reason : null,
  }));
  return { rows };
}
