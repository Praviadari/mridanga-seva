// My data and rights (audit 22-10-2026 fix 17, docs/DECISIONS.md #550-#556; migration 0059). A student or staff
// member reads what the class holds about them (my_data_summary, written to the access log), downloads it, and
// asks for a correction, an erasure, a withdrawal of the photo or data consent, a nominee, or makes a complaint
// (file_data_request). A child does not ask: the parent or guardian does, at the desk or by email, and the Guru
// records it (record_data_request). The Guru answers (answer_data_request) or carries a withdrawal or an erasure
// out (act_on_data_request) on staff/data-requests. Every request is answered within ANSWER_DAYS.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { fallbackErrorKey } from './errors';

/** Days the class has to answer a request (#551; the privacy notice says so too). */
export const ANSWER_DAYS = 30;
/** The privacy contact and grievance officer, as in the privacy notice ("Who is responsible"). */
export const PRIVACY_CONTACT = { name: 'Regula Sarvesh Chandra', email: 'privacy@mridangaseva.com', phone: '+91 99893 36301' } as const;
/** Longest text of a request or an answer, as in the database. */
export const REQUEST_TEXT_MAX = 2000;
/** Longest name of the field a correction is about. */
export const REQUEST_FIELD_MAX = 80;
/** Longest note of a withdrawal or an erasure (the reason in the tombstone). */
export const ACTION_NOTE_MAX = 500;

/** What a request asks for. `access` only comes from the desk: the summary is the person's own copy. */
export type RequestKind = 'access' | 'correction' | 'erasure' | 'withdraw_photo' | 'withdraw_data' | 'grievance' | 'nominate';
/** Where a request stands. */
export type RequestStatus = 'open' | 'done' | 'refused' | 'cancelled';
/** How it reached the class. */
export type RequestSource = 'app' | 'desk' | 'email';
/** Who asked: the person, or for a child a parent or guardian. */
export type AskedBy = 'self' | 'parent' | 'guardian';
/** What the Guru carries out for a withdrawal or an erasure. */
export type RequestAction = 'withdraw_photo' | 'withdraw_consent' | 'erase';

/** The kinds a person files in the app, in the order the form offers them. */
export const FILE_KINDS: readonly RequestKind[] = ['correction', 'withdraw_photo', 'withdraw_data', 'erasure', 'nominate', 'grievance'];
/** Every kind, for the desk's form. */
export const ALL_KINDS: readonly RequestKind[] = ['access', ...FILE_KINDS];

/** One request. `person` is filled for the Guru's list only. */
export type DataRequest = {
  id: string;
  ref: string;
  kind: RequestKind;
  status: RequestStatus;
  source: RequestSource;
  askedBy: AskedBy;
  field: string | null;
  body: string | null;
  answer: string | null;
  action: string | null;
  createdAt: string;
  answerBy: string;
  closedAt: string | null;
  person: RequestPerson | null;
};

/** Who a request is about, as the Guru sees it. Both parts are null once the person was erased. */
export type RequestPerson = {
  name: string | null;
  rollNo: string | null;
  email: string | null;
  dob: string | null;
  studentId: string | null;
  profileId: string | null;
};

type Row = {
  id: string;
  no: number;
  kind: RequestKind;
  status: RequestStatus;
  source: RequestSource;
  asked_by: AskedBy;
  field: string | null;
  body: string | null;
  answer: string | null;
  action: string | null;
  created_at: string;
  answer_by: string;
  closed_at: string | null;
  profile_id?: string | null;
  student_id?: string | null;
  student?: { full_name: string; roll_no: string; dob: string | null; email: string | null } | null;
  login?: { full_name: string; email: string | null } | null;
};

const OWN_COLUMNS = 'id, no, kind, status, source, asked_by, field, body, answer, action, created_at, answer_by, closed_at';
const GURU_COLUMNS =
  `${OWN_COLUMNS}, profile_id, student_id, student:students!data_requests_student_id_fkey(full_name, roll_no, dob, email), ` +
  'login:profiles!data_requests_profile_id_fkey(full_name, email)';

/** The reference people quote: DR-0012. */
export function requestRef(no: number): string {
  return `DR-${String(no).padStart(4, '0')}`;
}

function toRequest(row: Row): DataRequest {
  const withPerson = row.profile_id !== undefined;
  return {
    id: row.id,
    ref: requestRef(row.no),
    kind: row.kind,
    status: row.status,
    source: row.source,
    askedBy: row.asked_by,
    field: row.field,
    body: row.body,
    answer: row.answer,
    action: row.action,
    createdAt: row.created_at,
    answerBy: row.answer_by,
    closedAt: row.closed_at,
    person: withPerson
      ? {
          name: row.student?.full_name ?? row.login?.full_name ?? null,
          rollNo: row.student?.roll_no ?? null,
          email: row.login?.email ?? row.student?.email ?? null,
          dob: row.student?.dob ?? null,
          studentId: row.student_id ?? null,
          profileId: row.profile_id ?? null,
        }
      : null,
  };
}

/** Whole days from `now` until `answerBy` (negative once it has passed). */
export function daysLeft(answerBy: string, now = new Date()): number {
  return Math.ceil((new Date(answerBy).getTime() - now.getTime()) / 86_400_000);
}

/**
 * The person's own requests (made by them, about them), newest first. Filtered here too: the Guru's row-level
 * security reads every request. null = could not load; 'not_set_up' before 0059 has run.
 */
export async function fetchMyRequests(myId: string): Promise<DataRequest[] | null | 'not_set_up'> {
  const { data, error } = await supabase
    .from('data_requests')
    .select(OWN_COLUMNS)
    .eq('made_by', myId)
    .eq('profile_id', myId)
    .order('created_at', { ascending: false });
  if (error) return isMissing(error.code) ? 'not_set_up' : null;
  return (data as Row[]).map(toRequest);
}

/**
 * The Guru's list: every open request (soonest answer-by first), then those closed in the last 90 days, newest
 * first. null = could not load; 'not_set_up' before 0059 has run.
 */
export async function fetchAllRequests(): Promise<DataRequest[] | null | 'not_set_up'> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('data_requests')
    .select(GURU_COLUMNS)
    .or(`status.eq.open,closed_at.gte.${since}`);
  if (error) return isMissing(error.code) ? 'not_set_up' : null;
  const all = (data as unknown as Row[]).map(toRequest);
  const open = all.filter((r) => r.status === 'open').sort((a, b) => a.answerBy.localeCompare(b.answerBy));
  const closed = all.filter((r) => r.status !== 'open').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  return [...open, ...closed];
}

/** One request for the Guru. 'not_found' when it is gone (deleted two years after closing). */
export async function fetchRequest(id: string): Promise<DataRequest | 'not_found' | null> {
  const { data, error } = await supabase.from('data_requests').select(GURU_COLUMNS).eq('id', id).maybeSingle();
  if (error) return null;
  return data ? toRequest(data as unknown as Row) : 'not_found';
}

/** Open requests waiting for the Guru (the To do row). 0 when unknown or before 0059. */
export async function countOpenRequests(): Promise<number> {
  const { count, error } = await supabase.from('data_requests').select('id', { count: 'exact', head: true }).eq('status', 'open');
  return error ? 0 : (count ?? 0);
}

/** A request as typed on the form. */
export type RequestForm = { kind: RequestKind | null; field: string; body: string };

/** Errors of the request form, before it is sent. */
export type RequestFormErrors = Partial<Record<'kind' | 'field' | 'body', ParseKeys>>;

/** Checks the form as the database does. */
export function checkRequestForm(form: RequestForm): RequestFormErrors {
  const errors: RequestFormErrors = {};
  if (!form.kind) errors.kind = 'dataRights.errors.kind_invalid';
  if (form.kind === 'correction' && !form.field.trim()) errors.field = 'dataRights.errors.field_required';
  if (form.field.trim().length > REQUEST_FIELD_MAX) errors.field = 'dataRights.errors.field_too_long';
  if ((form.kind === 'correction' || form.kind === 'grievance' || form.kind === 'nominate') && !form.body.trim()) {
    errors.body = 'dataRights.errors.text_required';
  }
  if (form.body.trim().length > REQUEST_TEXT_MAX) errors.body = 'dataRights.errors.text_too_long';
  return errors;
}

/** Files the person's own request. */
export async function fileRequest(form: RequestForm): Promise<{ ref?: string; answerBy?: string; errorKey?: ParseKeys }> {
  const { data, error } = await supabase.rpc('file_data_request', {
    p_kind: form.kind,
    p_field: form.kind === 'correction' ? form.field.trim() : null,
    p_body: form.body.trim() || null,
  });
  if (error) return { errorKey: requestErrorKey(error.message, error.code) };
  const row = data as { ref: string; answer_by: string };
  return { ref: row.ref, answerBy: row.answer_by };
}

/** The person takes back an open request. */
export async function cancelRequest(id: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('cancel_data_request', { p_id: id });
  return error ? { errorKey: requestErrorKey(error.message, error.code) } : {};
}

/** A request the Guru records from the desk or an email. `who` = a roll number or a login's email. */
export type DeskForm = RequestForm & { who: string; source: 'desk' | 'email'; askedBy: AskedBy };

/** The Guru records a request made at the desk or by email. */
export async function recordRequest(form: DeskForm): Promise<{ ref?: string; errorKey?: ParseKeys }> {
  const { data, error } = await supabase.rpc('record_data_request', {
    p_who: form.who.trim(),
    p_kind: form.kind,
    p_source: form.source,
    p_asked_by: form.askedBy,
    p_field: form.kind === 'correction' ? form.field.trim() : null,
    p_body: form.body.trim() || null,
  });
  if (error) return { errorKey: requestErrorKey(error.message, error.code) };
  return { ref: (data as { ref: string }).ref };
}

/** The Guru answers: done (with "corrected" for a correction) or refused, with words for the person. */
export async function answerRequest(id: string, status: 'done' | 'refused', answer: string, corrected: boolean): Promise<{ errorKey?: ParseKeys }> {
  if (!answer.trim()) return { errorKey: 'dataRights.errors.answer_required' };
  if (answer.trim().length > REQUEST_TEXT_MAX) return { errorKey: 'dataRights.errors.text_too_long' };
  const { error } = await supabase.rpc('answer_data_request', { p_id: id, p_status: status, p_answer: answer.trim(), p_corrected: corrected });
  return error ? { errorKey: requestErrorKey(error.message, error.code) } : {};
}

/** What a withdrawal or an erasure returned (the database function's own answer). */
export type ActionResult = {
  ref: string;
  consents_revoked?: number;
  login_switched_off?: boolean;
  login_deleted?: boolean;
  audit_rows_redacted?: number;
  files?: string[];
};

/** The action a request of this kind is carried out with; null for kinds that are answered in words. */
export function actionFor(kind: RequestKind): RequestAction | null {
  if (kind === 'withdraw_photo') return 'withdraw_photo';
  if (kind === 'withdraw_data') return 'withdraw_consent';
  if (kind === 'erasure') return 'erase';
  return null;
}

/** The Guru carries out a withdrawal or an erasure, with the roll number (or email) typed to confirm. */
export async function actOnRequest(id: string, action: RequestAction, confirm: string, note: string): Promise<{ result?: ActionResult; errorKey?: ParseKeys }> {
  if (!note.trim()) return { errorKey: 'dataRights.errors.reason_required' };
  if (note.trim().length > ACTION_NOTE_MAX) return { errorKey: 'dataRights.errors.reason_too_long' };
  const { data, error } = await supabase.rpc('act_on_data_request', { p_id: id, p_action: action, p_confirm: confirm.trim(), p_note: note.trim() });
  if (error) return { errorKey: requestErrorKey(error.message, error.code) };
  return { result: data as ActionResult };
}

// ---------------------------------------------------------------- erasure by two people (0066, #712)

/** How the person asking for an erasure was checked, in the order the screen offers them. */
export const IDENTITY_CHECKS = ['own_login', 'id_seen', 'registered_email', 'phone_callback'] as const;
export type IdentityCheck = (typeof IDENTITY_CHECKS)[number];

/** Who filed or recorded a request, and the first Guru's approval of an erasure (null until approved). */
export type ErasureApproval = {
  madeBy: string | null;
  approved: { by: string; name: string | null; at: string; check: IdentityCheck } | null;
};

/** The checks that fit a request: "own login" only for one the person filed in the app themselves. */
export function identityChecksFor(request: Pick<DataRequest, 'source' | 'person'>, madeBy: string | null): IdentityCheck[] {
  const own = request.source === 'app' && madeBy !== null && madeBy === request.person?.profileId;
  return IDENTITY_CHECKS.filter((c) => c !== 'own_login' || own);
}

/** The approval state of one request. 'not_set_up' before 0066 (one Guru then carries an erasure out); null = could not load. */
export async function fetchErasureApproval(id: string): Promise<ErasureApproval | 'not_set_up' | null> {
  const { data, error } = await supabase
    .from('data_requests')
    .select('made_by, approved_by, approved_at, identity_check, approver:profiles!data_requests_approved_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) return error.code === '42703' || error.code === 'PGRST200' || isMissing(error.code) ? 'not_set_up' : null;
  if (!data) return null;
  const row = data as unknown as {
    made_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    identity_check: IdentityCheck | null;
    approver: { full_name: string } | null;
  };
  return {
    madeBy: row.made_by,
    approved:
      row.approved_by && row.approved_at && row.identity_check
        ? { by: row.approved_by, name: row.approver?.full_name ?? null, at: row.approved_at, check: row.identity_check }
        : null,
  };
}

/** The first Guru approves an open erasure request, saying how the person asking was checked. */
export async function approveErasure(id: string, check: IdentityCheck | null): Promise<{ errorKey?: ParseKeys }> {
  if (!check) return { errorKey: 'dataRights.errors.identity_invalid' };
  const { error } = await supabase.rpc('approve_data_erasure', { p_id: id, p_identity: check });
  return error ? { errorKey: requestErrorKey(error.message, error.code) } : {};
}

const KNOWN = [
  'kind_invalid', 'field_required', 'field_too_long', 'text_required', 'text_too_long', 'parent_asks', 'no_record',
  'no_photo_consent', 'already_open', 'too_many_requests', 'request_not_found', 'not_open', 'source_invalid',
  'asked_by_invalid', 'person_not_found', 'status_invalid', 'answer_required', 'use_the_action', 'action_invalid',
  'action_not_for_kind', 'confirm_mismatch', 'reason_required', 'reason_too_long', 'person_gone', 'open_loan',
  'not_pending', 'not_yourself', 'has_student_record',
  // 0066 (#712): erasure by two people
  'second_approval_needed', 'approver_cannot_erase', 'not_erasure', 'already_approved', 'identity_invalid', 'not_the_recorder',
] as const;

/** Turns a database error into a translation key. */
export function requestErrorKey(message: string, code: string | undefined): ParseKeys {
  const known = KNOWN.find((k) => k === message);
  if (known) return `dataRights.errors.${known}`;
  if (isMissing(code)) return 'dataRights.notSetUp';
  if (code === '42501' || message === 'not_allowed') return 'dataRights.errors.not_allowed';
  return fallbackErrorKey(message);
}

/** PostgREST's "no such table / function": 0059 has not run on this project yet. */
function isMissing(code: string | undefined): boolean {
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01';
}

// ---------------------------------------------------------------- the summary

/** One consent as the summary lists it. */
export type SummaryConsent = {
  scope: 'data' | 'photo' | 'face';
  method: 'written' | 'email_code';
  given_at: string;
  revoked_at: string | null;
  id_type_checked: string | null;
  notice_version: string | null;
};

/** What my_data_summary() returns (docs/DATABASE.md "Data requests (0059)"); `record` and below only with a record. */
export type MyDataSummary = {
  generated_at: string;
  login: { id: string; role: string; full_name: string; email: string | null; phone: string | null; language: string; created_at: string } & Record<string, unknown>;
  about: Record<string, unknown> | null;
  record:
    | ({
        id: string;
        roll_no: string;
        full_name: string;
        dob: string | null;
        phone: string | null;
        email: string | null;
        area: string | null;
        pincode: string | null;
        status: string;
        joined_on: string;
        withdrawn_at?: string | null;
      } & Record<string, unknown>)
    | null;
  minor: boolean;
  level_name: string | null;
  centre_name: string | null;
  mentor_name: string | null;
  requests: { ref: string; kind: RequestKind; status: RequestStatus; created_at: string; closed_at: string | null }[];
  devices: number;
  notices: number;
  replies: number;
  event_answers: number;
  poll_votes: number;
  ishtagoshti: Record<string, unknown> | null;
  guardians?: { name: string; relation: string | null; phone: string | null; email: string | null }[];
  consents?: SummaryConsent[];
  level_history?: { from: number | null; to: number; on: string }[];
  status_history?: { from: string | null; to: string; at: string }[];
  visits?: { count: number; first: string | null; last: string | null; list: { in: string; out: string | null }[] };
  practice?: { count: number; minutes: number; list: { on: string; minutes: number; note: string | null }[] };
  syllabus_ticks?: number;
  follow_up_calls?: { count: number; last: string | null };
  assessments?: number;
  events?: number;
  loans?: { issued_at: string; due_on: string | null; returned_at: string | null }[];
};

/** The signed-in person's summary. null = could not load; 'not_set_up' before 0059 has run. */
export async function fetchMyDataSummary(): Promise<MyDataSummary | null | 'not_set_up'> {
  const { data, error } = await supabase.rpc('my_data_summary');
  if (error) return isMissing(error.code) ? 'not_set_up' : null;
  return data as MyDataSummary;
}

/** True when a current (not revoked) consent of this scope is on the record. */
export function hasConsent(summary: MyDataSummary, scope: SummaryConsent['scope']): boolean {
  return (summary.consents ?? []).some((c) => c.scope === scope && !c.revoked_at);
}

/** The file name of the download: mridanga-seva-my-data-2026-10-23.json. */
export function summaryFileName(summary: MyDataSummary, ext: 'json' | 'html'): string {
  return `mridanga-seva-my-data-${summary.generated_at.slice(0, 10)}.${ext}`;
}

/** The download: the summary as the database gave it, readable (2-space indent). */
export function summaryJson(summary: MyDataSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}
