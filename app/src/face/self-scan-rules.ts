// Face self-scan (Phase 3 P3-5, docs/DECISIONS.md #344-#349): the rules of the student's own check-in and
// check-out on the phone, kept free of React Native so tests/self-scan.test.mjs can drive them. The server
// (migration 0071, self_scan) checks the same again; the phone checks first so a refusal is told at once,
// before the camera opens, with the coordinator's way always offered.
//
// - The location result: ONE position read at the tap (src/face/self-scan-location.ts), compared with the
//   centre's point the same way as the server's self_scan_location: a mocked position, an accuracy over
//   100 m (or none), no centre point, no position or no permission are never "inside". The result is bound
//   into the integrity token (0070's requestHash text), so the phone and the server must agree to the letter.
// - Check-in: only "inside" goes on. Check-out: every result goes on; not inside = saved and flagged.
// - The face: the blink/turn challenge, then VERIFY_FRAMES pictures; each must score as a real face, all of
//   one face, and their mean must match the face code kept on this phone at the threshold (the server's
//   face_match_percent, never lower than the app's own). Never a guess: below it = "no match".
// - Three failed tries in a day (MAX_SELF_SCAN_TRIES) → the screen sends the student to a coordinator.

import { cosine, meanTemplate } from './face-math';

export type SelfScanAction = 'check_in' | 'check_out';

/** The phone's one position, as sent to self_scan (p_location). Never stored by the server. */
export type PhonePosition =
  | { status: 'fix'; lat: number; lng: number; accuracy: number | null; mocked: boolean }
  | { status: 'refused' | 'no_fix' | 'no_location' };

/** visits.check_out_location's values (0071); a check-in is saved only when 'inside'. */
export type LocationResult = 'inside' | 'outside' | 'refused' | 'no_fix' | 'no_location' | 'no_area' | 'mocked' | 'inaccurate';

/** The centre's attendance area (self_scan_state's centre). */
export type CentreArea = { lat: number; lng: number; radius_m: number };

/** An accuracy worse than this is not trusted at all (WORK_PLAN P3-5). */
export const MAX_ACCURACY_M = 100;

/** Metres between two points: the haversine of 0024 / 0071, Earth radius 6 371 km. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  return (
    2 *
    6371000 *
    Math.asin(Math.sqrt(Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2))
  );
}

/** The location result of one position for the centre's area (0071 self_scan_location, the same order of rules). */
export function locationResult(position: PhonePosition, area: CentreArea | null): { result: LocationResult; distanceM: number | null } {
  if (position.status !== 'fix') return { result: position.status, distanceM: null };
  if (position.mocked) return { result: 'mocked', distanceM: null };
  const acc = position.accuracy;
  if (acc === null || !Number.isFinite(acc) || acc < 0 || acc > MAX_ACCURACY_M) return { result: 'inaccurate', distanceM: null };
  if (!area) return { result: 'no_area', distanceM: null };
  const d = distanceM(area.lat, area.lng, position.lat, position.lng);
  return { result: d <= area.radius_m + acc ? 'inside' : 'outside', distanceM: Math.round(d) };
}

/** The failure a location result is counted as (note_self_scan_failure), or null for "inside". */
export function locationFailure(result: LocationResult): { reason: 'outside' | 'mocked'; detail: LocationResult | null } | null {
  if (result === 'inside') return null;
  if (result === 'mocked') return { reason: 'mocked', detail: null };
  return { reason: 'outside', detail: result };
}

/** True when this action goes on after the location read: a check-in only from inside; a check-out always. */
export function locationAllows(action: SelfScanAction, result: LocationResult): boolean {
  return action === 'check_out' || result === 'inside';
}

/** 0070's requestHash text, exactly (verify-integrity/verdict.ts requestText). `login` = the signed-in profile id. */
export function selfScanRequestText(login: string, action: SelfScanAction, challenge: string, location: LocationResult): string {
  return `mrdg-selfscan-v1|${login}|${action}|${challenge}|${location}`;
}

/** self_scan_state's answer (0071). */
export type SelfScanState = {
  faceEnabled: boolean;
  enrolled: boolean;
  /** What the home's circle does now; null = no circle. */
  action: SelfScanAction | null;
  openNow: boolean;
  opensAt: string | null;
  closesAt: string | null;
  checkedInAt: string | null;
  centre: CentreArea | null;
  /** The server's 1:1 threshold (face_match_percent / 100). */
  matchMin: number | null;
  /** face_block_reason's code (no consent, too young ...), or null. */
  blocked: string | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Reads self_scan_state's JSON; null when it does not look like one. */
export function readSelfScanState(data: unknown): SelfScanState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.face_enabled !== 'boolean') return null;
  const c = d.centre && typeof d.centre === 'object' ? (d.centre as Record<string, unknown>) : null;
  const lat = num(c?.lat);
  const lng = num(c?.lng);
  const radius = num(c?.radius_m);
  return {
    faceEnabled: d.face_enabled,
    enrolled: d.enrolled === true,
    action: d.action === 'check_in' || d.action === 'check_out' ? d.action : null,
    openNow: d.open_now === true,
    opensAt: str(d.opens_at),
    closesAt: str(d.closes_at),
    checkedInAt: str(d.checked_in_at),
    centre: lat !== null && lng !== null && radius !== null ? { lat, lng, radius_m: radius } : null,
    matchMin: num(d.match_min),
    blocked: str(d.blocked),
  };
}

/** One analysed picture of the scan (src/face/pipeline.ts analyse). */
export type ScanSample = { embedding: Float32Array; realScore: number };

export type VerifyLimits = { minFrames: number; liveMin: number; selfMin: number; matchMin: number };

/** Why a scan does not check the student in: too few pictures, not a real face, not one face, not the student. */
export type VerifyProblem = 'tooFew' | 'liveness' | 'notOneFace' | 'noMatch';

/**
 * The 1:1 decision on the phone: every picture a real face (passive liveness), all of one face, and the mean of
 * the pictures close enough to the face code kept on this phone. `score` = cosine of the mean with the code.
 */
export function verifyScan(
  samples: readonly ScanSample[],
  template: Float32Array,
  limits: VerifyLimits,
): { ok: true; score: number } | { ok: false; problem: VerifyProblem; score: number | null } {
  if (samples.length < limits.minFrames) return { ok: false, problem: 'tooFew', score: null };
  if (samples.some((s) => !(s.realScore >= limits.liveMin))) return { ok: false, problem: 'liveness', score: null };
  const mean = meanTemplate(samples.map((s) => s.embedding));
  if (samples.some((s) => !(cosine(s.embedding, mean) >= limits.selfMin))) return { ok: false, problem: 'notOneFace', score: null };
  const score = cosine(mean, template);
  if (!(score >= limits.matchMin)) return { ok: false, problem: 'noMatch', score };
  return { ok: true, score };
}

/** The threshold the phone uses: the server's when it is stricter, never below the app's own. */
export function matchThreshold(appMin: number, serverMin: number | null): number {
  return serverMin !== null && serverMin > appMin && serverMin < 1 ? serverMin : appMin;
}

/** A failed scan (the face) as note_self_scan_failure counts it. */
export function faceFailureReason(problem: VerifyProblem): 'liveness' | 'no_match' {
  return problem === 'noMatch' ? 'no_match' : 'liveness';
}

/** self_scan's answer (0071), read for the screen. */
export type SelfScanOutcome =
  | { kind: 'in' | 'already_in' | 'out' | 'already_out'; at: string | null; flagged: boolean; location: LocationResult | null; minutes: number | null }
  | { kind: 'refused'; reason: SelfScanRefusal; detail: string | null; minutes: number | null };

/** self_scan's answered refusals; 'other' for one this app does not know yet. */
export type SelfScanRefusal =
  | 'integrity'
  | 'not_enrolled'
  | 'liveness'
  | 'no_match'
  | 'window'
  | 'outside'
  | 'mocked'
  | 'not_checked_in'
  | 'too_soon'
  | 'other';

const REFUSALS: readonly SelfScanRefusal[] = ['integrity', 'not_enrolled', 'liveness', 'no_match', 'window', 'outside', 'mocked', 'not_checked_in', 'too_soon'];
const RESULTS: readonly LocationResult[] = ['inside', 'outside', 'refused', 'no_fix', 'no_location', 'no_area', 'mocked', 'inaccurate'];

/** Reads self_scan's JSON; null when it does not look like an answer. */
export function readSelfScanOutcome(data: unknown): SelfScanOutcome | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const minutes = num(d.minutes);
  if (d.ok === true && (d.action === 'in' || d.action === 'already_in' || d.action === 'out' || d.action === 'already_out')) {
    const location = RESULTS.includes(d.location as LocationResult) ? (d.location as LocationResult) : null;
    return { kind: d.action, at: str(d.at), flagged: d.flagged === true, location, minutes };
  }
  if (d.ok === false) {
    const reason = REFUSALS.includes(d.reason as SelfScanRefusal) ? (d.reason as SelfScanRefusal) : 'other';
    return { kind: 'refused', reason, detail: str(d.detail), minutes };
  }
  return null;
}

/** Refusals that count toward the three tries (the face or the phone's check); place and time say "ask" at once. */
export function countsAsTry(reason: SelfScanRefusal | VerifyProblem): boolean {
  return ['integrity', 'liveness', 'no_match', 'tooFew', 'notOneFace', 'noMatch', 'other'].includes(reason);
}

/** Failed tries today on this phone (kept in memory only; a restart starts again, the server's limits still hold). */
export type Tries = { day: string; count: number };

/** The tries after one more failure on `day` (a new day starts at one). */
export function addTry(tries: Tries | null, day: string): Tries {
  return { day, count: tries && tries.day === day ? tries.count + 1 : 1 };
}

/** True when the student has failed MAX tries today: the screen offers only the coordinator's way. */
export function triesUsedUp(tries: Tries | null, day: string, max: number): boolean {
  return !!tries && tries.day === day && tries.count >= max;
}
