// Attendance (screens C5 Mark attendance and C6 Who is here now): reading who is checked in,
// finding a student by name, and the database calls that check students in and out.
//
// Two ways to mark, on purpose (docs/DECISIONS.md #18):
// - Scanning a student's QR code calls scan_qr, which TOGGLES: in if they are out, out if in.
// - Tapping a name calls mark_visit with the button's meaning, 'in' or 'out'. If the student is
//   already in that state (another phone marked them), nothing changes. A toggle here could undo
//   another coordinator's mark, because the list on this phone may be a little out of date.
// The functions are in supabase/migrations/0001_phase1.sql (toggle_visit, scan_qr) and
// 0004_attendance.sql (mark_visit, check_out_all); 0024 adds the phone's position at check-in (the
// visit is saved anyway and flagged when it is outside the centre's area, docs/DECISIONS.md #70);
// see docs/DATABASE.md "Attendance".

import type { ParseKeys } from 'i18next';

import type { PhoneLocation } from '@/lib/attendance-location';
import { startOfTodayInIndia } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

// ---------------------------------------------------------------- the QR code

/**
 * Start of the text in a student's QR code; the rest is the student's `qr_token`. The "1" is a
 * version, so the content can change later (for example to codes that expire) without old
 * scanners mistaking new codes for old ones (docs/DECISIONS.md #17).
 */
export const STUDENT_QR_PREFIX = 'MS1:';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The text to put in a student's QR code (screen S3), from their `qr_token`. Upper case, because
 * a QR code holding only capitals, digits and a few signs is smaller and easier to scan.
 */
export function studentQrText(qrToken: string): string {
  return STUDENT_QR_PREFIX + qrToken.toUpperCase();
}

/**
 * Reads the text of a scanned QR code. Returns the student's `qr_token` (lower case, as the
 * database stores it), or null when the code is not a Mridanga Seva student code, e.g. a
 * payment QR. A bare token without the prefix is accepted too, for cards printed by hand.
 */
export function qrTokenFromScan(text: string): string | null {
  const trimmed = text.trim();
  const token = trimmed.toUpperCase().startsWith(STUDENT_QR_PREFIX)
    ? trimmed.slice(STUDENT_QR_PREFIX.length)
    : trimmed;
  return UUID.test(token) ? token.toLowerCase() : null;
}

// ---------------------------------------------------------------- results of marking

/**
 * The result of the location check at check-in (migration 0024). null = not checked (visits from
 * before the check). 'no_area' = the centre has no point yet: nothing to compare, not flagged.
 */
export type LocationCheck = 'inside' | 'outside' | 'refused' | 'no_fix' | 'no_location' | 'no_area' | null;

/** Results that are flagged for the Guru (the visit is saved all the same). */
export const FLAGGED_CHECKS: readonly LocationCheck[] = ['outside', 'refused', 'no_fix', 'no_location'];

/** True when a visit's location result is flagged. */
export function isFlagged(check: LocationCheck | undefined): boolean {
  return !!check && FLAGGED_CHECKS.includes(check);
}

/** Who was marked, as shown on the result card, so the coordinator can check it is the right person. */
type Marked = { fullName: string; rollNo: string };

/** What happened after a scan or a tap. `at` is an ISO timestamp from the database. */
export type VisitResult =
  | (Marked & { action: 'in'; at: string; locationCheck: LocationCheck; distanceM: number | null })
  | (Marked & { action: 'out'; at: string; /** Length of the visit. */ minutes: number })
  | (Marked & { action: 'already_in' | 'already_out' })
  | { action: 'unknown' };

/** The JSON that toggle_visit, scan_qr and mark_visit return. */
type VisitJson = {
  action: VisitResult['action'];
  full_name?: string;
  roll_no?: string;
  at?: string;
  minutes?: number;
  location_check?: LocationCheck;
  distance_m?: number | null;
};

function toVisitResult(json: VisitJson): VisitResult {
  if (json.action === 'unknown') return { action: 'unknown' };
  const marked = { fullName: json.full_name ?? '', rollNo: json.roll_no ?? '' };
  switch (json.action) {
    case 'in':
      return {
        ...marked,
        action: 'in',
        at: json.at ?? '',
        locationCheck: json.location_check ?? null,
        distanceM: json.distance_m ?? null,
      };
    case 'out':
      return { ...marked, action: 'out', at: json.at ?? '', minutes: json.minutes ?? 0 };
    default:
      return { ...marked, action: json.action };
  }
}

/** Either a result, or the key of the message to show when the call failed. */
export type MarkOutcome = { result?: VisitResult; errorKey?: MessageKey };

/**
 * Checks a student in or out from a scanned QR token (see qrTokenFromScan). location is the
 * phone's position (lib/attendance-location.ts); the database uses it only for a check-in.
 */
export async function scanStudentQr(qrToken: string, location?: PhoneLocation): Promise<MarkOutcome> {
  const { data, error } = await supabase.rpc('scan_qr', { p_qr: qrToken, p_location: location ?? null });
  if (error) return { errorKey: attendanceErrorKey(error.message, error.code) };
  return { result: toVisitResult(data as VisitJson) };
}

/**
 * Checks a student in (`'in'`) or out (`'out'`) after a tap on their name. Changes nothing when
 * they already are, and says so in the result ('already_in' / 'already_out'). location is the
 * phone's position for a check-in (lib/attendance-location.ts).
 */
export async function markVisit(studentId: string, action: 'in' | 'out', location?: PhoneLocation): Promise<MarkOutcome> {
  const { data, error } = await supabase.rpc('mark_visit', {
    p_student: studentId,
    p_action: action,
    p_location: action === 'in' ? (location ?? null) : null,
  });
  if (error) return { errorKey: attendanceErrorKey(error.message, error.code) };
  return { result: toVisitResult(data as VisitJson) };
}

/**
 * Checks out everyone still checked in, for closing time. Returns how many visits were closed,
 * or the message key when it failed.
 */
export async function checkOutAll(): Promise<{ closed?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('check_out_all');
  if (error) return { errorKey: attendanceErrorKey(error.message, error.code) };
  return { closed: data as number };
}

/** Maps an error from the attendance functions to a message. */
function attendanceErrorKey(message: string, code: string | undefined): MessageKey {
  switch (message) {
    // toggle_visit and scan_qr (0001) word their errors with spaces; mark_visit and
    // check_out_all (0004) use snake_case codes. Both are listed.
    case 'not allowed':
    case 'not_allowed':
      return 'attendance.errors.notAllowed';
    case 'student not found':
    case 'student_not_found':
      return 'attendance.errors.notFound';
  }
  // Two phones checked in the same student at the same instant; one of them won.
  if (code === '23505') return 'attendance.errors.alreadyMarked';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}

// ---------------------------------------------------------------- who is here

/** A student who is checked in now: an open visit (no check-out yet). */
export type OpenVisit = {
  visitId: number;
  /** ISO timestamp of the check-in. */
  checkIn: string;
  studentId: string;
  fullName: string;
  rollNo: string;
  levelId: number;
  /** The location check of this check-in (flagged ones are marked in the list). */
  locationCheck: LocationCheck;
  distanceM: number | null;
};

/** What the attendance screens show at the top: who is here, and how many visits today. */
export type AttendanceToday = {
  /** Open visits, the earliest check-in first. */
  hereNow: OpenVisit[];
  /** Check-ins since midnight in India, including students who have already left. */
  visitsToday: number;
  /**
   * When this was read (milliseconds since 1970, like Date.now()). Screens work out "here for
   * 1 h 10 min" from it, so the figure matches the list and does not change on every redraw.
   */
  loadedAt: number;
};

type OpenVisitRow = {
  id: number;
  check_in: string;
  location_check: LocationCheck;
  location_distance_m: number | null;
  student: { id: string; full_name: string; roll_no: string; level_id: number } | null;
};

/**
 * Loads who is checked in now and today's number of visits. Returns null when it could not be
 * loaded (usually no internet). A visit left open from an earlier day is included: the nightly
 * job normally closes those, and if it did not, the coordinator should see and close them.
 */
export async function fetchAttendanceToday(): Promise<AttendanceToday | null> {
  const [open, today] = await Promise.all([
    supabase
      .from('visits')
      .select('id, check_in, location_check, location_distance_m, student:students (id, full_name, roll_no, level_id)')
      .is('check_out', null)
      .order('check_in'),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .gte('check_in', startOfTodayInIndia()),
  ]);
  if (open.error || today.error) return null;
  const rows = open.data as unknown as OpenVisitRow[];
  return {
    hereNow: rows.flatMap((row) =>
      row.student
        ? [
            {
              visitId: row.id,
              checkIn: row.check_in,
              studentId: row.student.id,
              fullName: row.student.full_name,
              rollNo: row.student.roll_no,
              levelId: row.student.level_id,
              locationCheck: row.location_check,
              distanceM: row.location_distance_m,
            },
          ]
        : [],
    ),
    visitsToday: today.count ?? 0,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------- finding a student

/** A student found by the name search. */
export type FoundStudent = { id: string; fullName: string; rollNo: string; levelId: number };

/** Shortest search text worth sending; one letter would match most of the class. */
export const MIN_SEARCH_LENGTH = 2;

/** Most students a search shows. The coordinator types more letters to narrow it down. */
const SEARCH_LIMIT = 20;

/**
 * The search text reduced to letters (any script, with their vowel signs), digits, spaces and
 * hyphens. Anything else could be read as part of the database query's own syntax.
 */
export function cleanSearchText(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds students whose name or roll number contains the text, in any status (a student who
 * left and comes back is checked in like anyone else). Returns null when the search failed.
 */
export async function searchStudents(text: string): Promise<FoundStudent[] | null> {
  const query = cleanSearchText(text);
  if (query.length < MIN_SEARCH_LENGTH) return [];
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, roll_no, level_id')
    .or(`full_name.ilike.*${query}*,roll_no.ilike.*${query}*`)
    .order('full_name')
    .limit(SEARCH_LIMIT);
  if (error) return null;
  return (data as { id: string; full_name: string; roll_no: string; level_id: number }[]).map((s) => ({
    id: s.id,
    fullName: s.full_name,
    rollNo: s.roll_no,
    levelId: s.level_id,
  }));
}
