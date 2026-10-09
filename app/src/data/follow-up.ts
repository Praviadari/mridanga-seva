// Following up students who stop coming (screens C10 Follow-up queue and C11 Call log).
//
// The daily job marks a student Irregular after 14 days without a visit and gives their mentor a
// "call" task; after 30 days they become Inactive (docs/DATABASE.md "Student status"). The
// coordinator calls and records what happened with log_call
// (supabase/migrations/0005_students_follow_up.sql). A logged call is the ONLY way a student
// becomes Paused or Left (docs/DECISIONS.md #4), so this file never updates students.status.

import { addDays, parseDayMonthYear, todayLocal } from '@/lib/dates';
import { readLogged } from '@/lib/logged-read';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';
import type { OpenTask } from './student-profile';
import { fetchStaff, fetchStudentSummaries, type StaffMember, type StudentSummary } from './student-overview';

// ---------------------------------------------------------------- outcomes and reasons

/** What came of a call, as in the call_outcome type of the database. */
export const CALL_OUTCOMES = ['returning', 'paused', 'not_reachable', 'discontinued'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * The reason codes migration 0005 puts in settings.call_reasons, each with a translation
 * (callReasons.<code>). The Guru may add more in settings later; those show as written.
 */
export const KNOWN_CALL_REASONS = [
  'studies',
  'work_timing',
  'moved',
  'health',
  'family',
  'lost_interest',
  'joined_elsewhere',
  'travel',
  'other',
] as const;
export type KnownCallReason = (typeof KNOWN_CALL_REASONS)[number];

/** True when the app has a translation for this reason code. */
export function isKnownCallReason(code: string): code is KnownCallReason {
  return (KNOWN_CALL_REASONS as readonly string[]).includes(code);
}

/** Outcomes that need a date: when the student said they would come, or the pause-until date. */
export function outcomeNeedsDate(outcome: CallOutcome): boolean {
  return outcome === 'returning' || outcome === 'paused';
}

/**
 * Outcomes that need a reason. "Not reachable" has none: nobody answered to give one. The
 * database has the same rule (call_logs check, and log_call's reason_required).
 */
export function outcomeNeedsReason(outcome: CallOutcome): boolean {
  return outcome !== 'not_reachable';
}

// ---------------------------------------------------------------- C10 the queue

/** Where a student sits in the follow-up queue, in the order the screen shows the groups. */
export const QUEUE_GROUPS = ['escalated', 'due', 'later', 'noTask'] as const;
export type QueueGroup = (typeof QUEUE_GROUPS)[number];

/** One student in the follow-up queue, with the task that brought them there, if any. */
export type QueueEntry = {
  student: StudentSummary;
  /** The most urgent open task: an escalated one first, then the earliest due. */
  task: OpenTask | null;
  group: QueueGroup;
};

/** The queue and the staff names it shows (mentor, who the task is for). */
export type FollowUpQueue = { entries: QueueEntry[]; staff: StaffMember[] };

/**
 * Which group an entry belongs to:
 * - escalated: the Guru should step in (3 failed tries, or no call by the time they turned Inactive)
 * - due: a call task due today or earlier
 * - later: a call task due on a later day (e.g. after "Returning on ...")
 * - noTask: Irregular or Inactive, but no open task (e.g. a task was closed by hand)
 */
function groupOf(task: OpenTask | null, today: string): QueueGroup {
  if (!task) return 'noTask';
  if (task.escalated) return 'escalated';
  return task.dueOn <= today ? 'due' : 'later';
}

/** Escalated first, then earliest due. */
function mostUrgent(tasks: OpenTask[]): OpenTask | null {
  const sorted = [...tasks].sort(
    (a, b) => Number(b.escalated) - Number(a.escalated) || a.dueOn.localeCompare(b.dueOn),
  );
  return sorted[0] ?? null;
}

/**
 * Builds the queue from all students and all open tasks: every student with an open task, and
 * every Irregular or Inactive student even without one, so nobody who stopped coming is missed.
 * Sorted by group, then by the task's due date, then by days away (longest first).
 */
export function buildQueue(students: readonly StudentSummary[], tasks: readonly (OpenTask & { studentId: string })[], today: string): QueueEntry[] {
  const tasksByStudent = new Map<string, OpenTask[]>();
  for (const task of tasks) {
    tasksByStudent.set(task.studentId, [...(tasksByStudent.get(task.studentId) ?? []), task]);
  }
  const entries: QueueEntry[] = [];
  for (const student of students) {
    const task = mostUrgent(tasksByStudent.get(student.id) ?? []);
    if (!task && student.status !== 'irregular' && student.status !== 'inactive') continue;
    entries.push({ student, task, group: groupOf(task, today) });
  }
  return entries.sort(
    (a, b) =>
      QUEUE_GROUPS.indexOf(a.group) - QUEUE_GROUPS.indexOf(b.group) ||
      (a.task?.dueOn ?? '').localeCompare(b.task?.dueOn ?? '') ||
      b.student.daysSinceVisit - a.student.daysSinceVisit,
  );
}

/**
 * True when the entry is for the signed-in coordinator: the task is assigned to them, or they
 * are the student's mentor.
 */
export function isMine(entry: QueueEntry, myId: string | null): boolean {
  if (myId === null) return false;
  return entry.task?.assigneeId === myId || entry.student.mentorId === myId;
}

/** Loads the follow-up queue. Returns null when it could not be loaded (usually no internet). */
export async function fetchFollowUpQueue(): Promise<FollowUpQueue | null> {
  const [students, staff, tasks] = await Promise.all([
    fetchStudentSummaries(),
    fetchStaff(),
    supabase
      .from('follow_up_tasks')
      .select('id, student_id, kind, due_on, attempt, escalated, assignee_id')
      .is('done_at', null),
  ]);
  if (!students || !staff || tasks.error) return null;
  const openTasks = (
    tasks.data as {
      id: string;
      student_id: string;
      kind: 'call' | 'retry';
      due_on: string;
      attempt: number;
      escalated: boolean;
      assignee_id: string | null;
    }[]
  ).map((t) => ({
    id: t.id,
    studentId: t.student_id,
    kind: t.kind,
    dueOn: t.due_on,
    attempt: t.attempt,
    escalated: t.escalated,
    assigneeId: t.assignee_id,
  }));
  return { entries: buildQueue(students, openTasks, todayLocal()), staff };
}

// ---------------------------------------------------------------- C11 logging a call

/** Who is being called, and what the call screen needs to show. */
export type CallContext = {
  studentId: string;
  fullName: string;
  rollNo: string;
  status: StudentSummary['status'];
  daysSinceVisit: number;
  lastVisitAt: string | null;
  joinedOn: string;
  phone: string | null;
  /** For a minor, call the parent; everyone else has none. */
  guardians: { fullName: string; phone: string | null; relation: string | null }[];
  /** The reason codes to choose from (settings.call_reasons), in the Guru's order. */
  reasons: string[];
  /** The latest calls, newest first, so the caller knows what was said last time. */
  lastCalls: { calledAt: string; outcome: CallOutcome; comment: string }[];
};

/** How many earlier calls the call screen shows. */
const LAST_CALLS = 3;

/**
 * Loads what the call screen needs for one student. Returns 'not_found' when there is no such
 * student, and null when it could not be loaded.
 */
export async function fetchCallContext(studentId: string): Promise<CallContext | 'not_found' | null> {
  const [overview, record, guardians, reasons, calls] = await Promise.all([
    supabase
      .from('student_overview')
      .select('full_name, roll_no, status, days_since_visit, last_visit_at, joined_on')
      .eq('id', studentId)
      .maybeSingle(),
    supabase.from('students').select('phone').eq('id', studentId).maybeSingle(),
    readLogged(supabase.rpc('get_guardians', { p_student: studentId }), () =>
      supabase.from('guardians').select('full_name, phone, relation').eq('student_id', studentId),
    ),
    supabase.from('settings').select('value').eq('key', 'call_reasons').maybeSingle(),
    readLogged(supabase.rpc('get_call_notes', { p_student: studentId, p_limit: LAST_CALLS }), () =>
      supabase
        .from('call_logs')
        .select('called_at, outcome, comment')
        .eq('student_id', studentId)
        .order('called_at', { ascending: false })
        .limit(LAST_CALLS),
    ),
  ]);
  if (overview.error || record.error || guardians.error || reasons.error || calls.error) return null;
  if (!overview.data || !record.data) return 'not_found';
  const o = overview.data as {
    full_name: string;
    roll_no: string;
    status: StudentSummary['status'];
    days_since_visit: number;
    last_visit_at: string | null;
    joined_on: string;
  };
  const reasonList = (reasons.data?.value as unknown) ?? [];
  return {
    studentId,
    fullName: o.full_name,
    rollNo: o.roll_no,
    status: o.status,
    daysSinceVisit: o.days_since_visit,
    lastVisitAt: o.last_visit_at,
    joinedOn: o.joined_on,
    phone: (record.data as { phone: string | null }).phone,
    guardians: (guardians.data as { full_name: string; phone: string | null; relation: string | null }[]).map((g) => ({
      fullName: g.full_name,
      phone: g.phone,
      relation: g.relation,
    })),
    // settings is edited by hand in the dashboard; keep only text entries if it is ever mistyped.
    reasons: Array.isArray(reasonList) ? reasonList.filter((r): r is string => typeof r === 'string') : [],
    lastCalls: (calls.data as { called_at: string; outcome: CallOutcome; comment: string }[]).map((c) => ({
      calledAt: c.called_at,
      outcome: c.outcome,
      comment: c.comment,
    })),
  };
}

/** Everything typed or chosen on the call screen. */
export type CallForm = {
  outcome: CallOutcome | null;
  /** Reason code, or null while none is chosen. */
  reason: string | null;
  /** As typed, day-month-year, e.g. '15-10-2026'. */
  nextDate: string;
  comment: string;
};

/** An empty call form. */
export const EMPTY_CALL_FORM: CallForm = { outcome: null, reason: null, nextDate: '', comment: '' };

/** A problem with one field of the call form, as the key of the message to show under it. */
export type CallFormErrors = Partial<Record<keyof CallForm, MessageKey>>;

/** How far ahead a pause or a "coming back on" date may be; the database allows 366 (0038). */
const MAX_DAYS_AHEAD = 365;

/**
 * Checks the call form before it is sent. `today` is 'YYYY-MM-DD' at the class. The database checks
 * the same things again (log_call in migration 0005).
 */
export function checkCallForm(form: CallForm, today: string): CallFormErrors {
  const errors: CallFormErrors = {};
  // Every problem is reported at once, so the coordinator fixes them in one go.
  if (!form.comment.trim()) errors.comment = 'callLog.errors.commentRequired';
  if (!form.outcome) {
    errors.outcome = 'callLog.errors.choose';
    return errors;
  }
  if (outcomeNeedsReason(form.outcome) && !form.reason) errors.reason = 'callLog.errors.choose';
  if (outcomeNeedsDate(form.outcome)) {
    const iso = parseDayMonthYear(form.nextDate);
    if (!form.nextDate.trim()) errors.nextDate = 'callLog.errors.dateRequired';
    else if (!iso) errors.nextDate = 'callLog.errors.dateInvalid';
    else if (iso < today) errors.nextDate = 'callLog.errors.datePast';
    // A year at most (D6-14): a typo like 2062 would hide the student from follow-up for decades.
    else if (iso > addDays(today, MAX_DAYS_AHEAD)) errors.nextDate = 'callLog.errors.dateTooFar';
  }
  return errors;
}

/**
 * Records the call with log_call, which also applies the outcome: Paused until the date, Left,
 * a new call task the day after "returning on", or a retry task (escalated to the Guru after
 * too many failed tries). Call only after checkCallForm found no problems.
 */
export async function logCall(studentId: string, form: CallForm): Promise<{ errorKey?: MessageKey }> {
  if (!form.outcome) return { errorKey: 'callLog.errors.choose' };
  const { error } = await supabase.rpc('log_call', {
    p_student: studentId,
    p_outcome: form.outcome,
    p_reason: outcomeNeedsReason(form.outcome) ? form.reason : null,
    p_comment: form.comment.trim(),
    p_next_date: outcomeNeedsDate(form.outcome) ? parseDayMonthYear(form.nextDate) : null,
  });
  if (error) return { errorKey: callErrorKey(error.message) };
  return {};
}

/** Maps an error from log_call to a message. The codes are listed in migration 0005. */
function callErrorKey(message: string): MessageKey {
  switch (message) {
    case 'not_allowed':
      return 'callLog.errors.notAllowed';
    case 'student_not_found':
      return 'callLog.errors.notFound';
    case 'outcome_required':
    case 'reason_required':
      return 'callLog.errors.choose';
    case 'reason_unknown':
      return 'callLog.errors.reasonUnknown';
    case 'comment_required':
      return 'callLog.errors.commentRequired';
    case 'next_date_required':
      return 'callLog.errors.dateRequired';
    case 'next_date_past':
      return 'callLog.errors.datePast';
    case 'next_date_too_far':
      return 'callLog.errors.dateTooFar';
    case 'student_withdrawn': // consent withdrawn, the record is frozen (0025)
      return 'common.studentWithdrawn';
  }
  return fallbackErrorKey(message);
}
