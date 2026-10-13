// Helpers shared by the src/data/* files for reading errors that come back from Supabase.

import type { ParseKeys } from 'i18next';

/** A translation key for a message; what every data function returns as `errorKey`. */
export type MessageKey = ParseKeys;

/**
 * How each platform words a request that never reached the server: Chrome and Edge, Android and
 * iOS, Safari, Firefox (D6-05). supabase-js passes the wording on inside its error message.
 */
const NETWORK_WORDING = ['Failed to fetch', 'Network request failed', 'Load failed', 'NetworkError when attempting to fetch'];

/**
 * True when a Supabase call failed because the server could not be reached (no internet, server
 * paused), rather than because the database refused. supabase-js reports a failed network
 * request with the browser's or phone's own wording, which differs by platform.
 */
export function isNetworkError(message: string): boolean {
  return NETWORK_WORDING.some((words) => message.includes(words));
}

/**
 * The message for an error that a data file's own code list does not know: no internet, a withdrawn
 * student, or the general "something went wrong". The error mappers end with this, so these are worded
 * once. student_withdrawn: since 0048 (#281) nothing new is recorded about a student whose consent was
 * withdrawn — Accept, a desk Save, a loan, a practice log, a nomination all refuse it (#292).
 * own_record, own_mentor, staff_login_linked: a staff member's own student record (0053, #318-#320): nobody
 * marks, ticks, nominates, calls or mentors themselves, from any screen; a colleague does.
 */
export function fallbackErrorKey(message: string): MessageKey {
  if (message === 'student_withdrawn' || message === 'already_withdrawn') return 'common.studentWithdrawn';
  if (message === 'own_record') return 'common.ownRecord';
  if (message === 'own_mentor') return 'common.ownMentor';
  if (message === 'staff_login_linked') return 'common.staffLoginLinked';
  const known = SERVER_MESSAGES[message];
  if (known) return known;
  return isNetworkError(message) ? 'common.networkError' : 'common.genericError';
}

/**
 * Database refusals a screen can meet (a race between two desks, a record frozen meanwhile, a rule the form
 * does not check first) that no data file's own list words (audit D8-21, phase 4 B4-9, docs/DECISIONS.md #334).
 * The rest of the 50 codes found unworded are refusals of bad input the screens never send; they keep the
 * general message.
 */
const SERVER_MESSAGES: Partial<Record<string, MessageKey>> = {
  material_frozen: 'common.serverErrors.frozen',
  assessment_frozen: 'common.serverErrors.frozen',
  event_frozen: 'common.serverErrors.frozen',
  poll_frozen: 'common.serverErrors.frozen',
  fund_entry_frozen: 'common.serverErrors.frozen',
  student_field_locked: 'common.serverErrors.locked',
  profile_field_locked: 'common.serverErrors.locked',
  visit_field_locked: 'common.serverErrors.locked',
  consent_locked: 'common.serverErrors.locked',
  option_code_locked: 'common.serverErrors.locked',
  location_locked: 'common.serverErrors.locked',
  theme_not_found: 'common.serverErrors.notFound',
  sloka_not_found: 'common.serverErrors.notFound',
  profile_not_found: 'common.serverErrors.notFound',
  guardian_not_found: 'common.serverErrors.notFound',
  student_not_linked: 'common.serverErrors.notFound',
  open_loan: 'common.serverErrors.openLoan',
  roll_no_frozen: 'common.serverErrors.rollNoFrozen',
  roll_no_missing: 'common.serverErrors.rollNoMissing',
  status_needs_call_log: 'common.serverErrors.needsCallLog',
  group_inactive: 'common.serverErrors.groupInactive',
  member_not_allowed: 'common.serverErrors.memberNotAllowed',
  switch_off_first: 'common.serverErrors.switchOffFirst',
  not_yourself: 'common.serverErrors.notYourself',
  role_guru_only: 'common.serverErrors.guruOnly',
  not_staff: 'common.serverErrors.staffOnly',
  centre_delete_not_allowed: 'common.serverErrors.centreInUse',
  fund_entry_kept: 'common.serverErrors.fundKept',
  request_id_used: 'common.serverErrors.alreadySaved',
  visit_time_future: 'common.serverErrors.visitFuture',
  setting_required: 'common.serverErrors.settingRequired',
  too_many_rows: 'common.serverErrors.tooManyRows',
};
