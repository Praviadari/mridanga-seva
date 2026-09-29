// One student's full record for staff (screen C8 Student profile): details, recent visits,
// syllabus progress in their level, follow-up calls, open call tasks, level history, and for a
// minor the parent and consent. Staff only: guardians, consents and call logs are closed to
// students by row-level security (docs/DATABASE.md "Who can see what"), so a student-facing
// screen must never reuse this.

import { isMinorOn, todayInIndia } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import type { CallOutcome } from './follow-up';
import { OVERVIEW_COLUMNS, toStudentSummary, type StudentSummary } from './student-overview';

/** How many recent visits the profile lists. Older ones count in the totals only. */
const RECENT_VISITS = 10;
/** Visits in this many days are counted for "visits in the last 30 days". */
const RECENT_DAYS = 30;

/** Details of the student record beyond the list summary. */
export type StudentDetails = StudentSummary & {
  /** 'YYYY-MM-DD', or null for records made before the date of birth was required. */
  dob: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  pincode: string | null;
  /** True when an app login is connected to the record. */
  hasLogin: boolean;
};

/** One visit: ISO timestamps; `checkOut` is null while the student is still here. */
export type VisitEntry = { id: number; checkIn: string; checkOut: string | null; method: string };

/** One syllabus item of the student's level, with the day it was ticked, if it was. */
export type ProgressItem = { id: number; sort: number; title: string; doneOn: string | null; remark: string | null };

/** One follow-up call, newest first in the profile. */
export type CallEntry = {
  id: string;
  /** ISO timestamp. */
  calledAt: string;
  outcome: CallOutcome;
  /** Code from settings.call_reasons, or null (not reachable). */
  reason: string | null;
  comment: string;
  /** 'YYYY-MM-DD': the date they said they would come, or the pause-until date. */
  nextDate: string | null;
  coordinatorId: string;
};

/** A reminder to call the student that nobody has done yet. */
export type OpenTask = {
  id: string;
  kind: 'call' | 'retry';
  /** 'YYYY-MM-DD'. */
  dueOn: string;
  /** 1 for the first call; each failed try adds one. */
  attempt: number;
  /** Shown to the Guru: too many failed tries, or still no call when the student became Inactive. */
  escalated: boolean;
  assigneeId: string | null;
};

/** A level change (promotion). */
export type LevelChange = { id: number; fromLevel: number | null; toLevel: number; changedOn: string; approvedBy: string | null };

/** A parent or guardian, with the codes the app translates (relations.*). */
export type Guardian = { id: string; fullName: string; phone: string | null; email: string | null; relation: string | null };

/** A consent record (DPDP, docs/DECISIONS.md #8 and #16). */
export type Consent = {
  id: string;
  scope: 'data' | 'photo' | 'face';
  method: 'written' | 'email_code';
  /** Code of the ID the coordinator looked at (idTypes.*); the number is never stored. */
  idTypeChecked: string | null;
  /** ISO timestamp. */
  givenAt: string;
  /** ISO timestamp, or null while the consent stands. */
  revokedAt: string | null;
};

/** Everything the profile screen shows. */
export type StudentProfile = {
  student: StudentDetails;
  /** Under 18 today, so a parent's consent is required. */
  minor: boolean;
  recentVisits: VisitEntry[];
  totalVisits: number;
  visitsLast30Days: number;
  /** The syllabus of the student's current level, in teaching order. */
  progress: ProgressItem[];
  calls: CallEntry[];
  openTasks: OpenTask[];
  levelHistory: LevelChange[];
  guardians: Guardian[];
  consents: Consent[];
};

/**
 * Loads one student's profile. Returns 'not_found' when there is no such student (or the person
 * may not see them), and null when it could not be loaded (usually no internet).
 */
export async function fetchStudentProfile(studentId: string): Promise<StudentProfile | 'not_found' | null> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [overview, record, visits, total, recent, progress, calls, tasks, levels, guardians, consents] =
    await Promise.all([
      supabase.from('student_overview').select(OVERVIEW_COLUMNS).eq('id', studentId).maybeSingle(),
      supabase
        .from('students')
        .select('dob, phone, email, area, pincode, profile_id')
        .eq('id', studentId)
        .maybeSingle(),
      supabase
        .from('visits')
        .select('id, check_in, check_out, method')
        .eq('student_id', studentId)
        .order('check_in', { ascending: false })
        .limit(RECENT_VISITS),
      supabase.from('visits').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .gte('check_in', since),
      supabase.from('student_progress').select('item_id, done_on, remark').eq('student_id', studentId),
      supabase
        .from('call_logs')
        .select('id, called_at, outcome, reason, comment, next_date, coordinator_id')
        .eq('student_id', studentId)
        .order('called_at', { ascending: false }),
      supabase
        .from('follow_up_tasks')
        .select('id, kind, due_on, attempt, escalated, assignee_id')
        .eq('student_id', studentId)
        .is('done_at', null)
        .order('due_on'),
      supabase
        .from('level_history')
        .select('id, from_level, to_level, changed_on, approved_by')
        .eq('student_id', studentId)
        .order('changed_on', { ascending: false }),
      supabase.from('guardians').select('id, full_name, phone, email, relation').eq('student_id', studentId),
      supabase
        .from('consents')
        .select('id, scope, method, id_type_checked, given_at, revoked_at')
        .eq('student_id', studentId)
        .order('given_at', { ascending: false }),
    ]);
  const failed = [overview, record, visits, total, recent, progress, calls, tasks, levels, guardians, consents].some(
    (result) => result.error,
  );
  if (failed) return null;
  if (!overview.data || !record.data) return 'not_found';

  const summary = toStudentSummary(overview.data as Parameters<typeof toStudentSummary>[0]);
  const details = record.data as {
    dob: string | null;
    phone: string | null;
    email: string | null;
    area: string | null;
    pincode: string | null;
    profile_id: string | null;
  };

  // The syllabus is read after the student, because it depends on their level.
  const items = await supabase
    .from('syllabus_items')
    .select('id, sort, title')
    .eq('level_id', summary.levelId)
    .order('sort');
  if (items.error) return null;
  const ticked = new Map(
    (progress.data as { item_id: number; done_on: string; remark: string | null }[]).map((p) => [p.item_id, p]),
  );

  return {
    student: {
      ...summary,
      dob: details.dob,
      phone: details.phone,
      email: details.email,
      area: details.area,
      pincode: details.pincode,
      hasLogin: details.profile_id !== null,
    },
    minor: details.dob !== null && isMinorOn(details.dob, todayInIndia()),
    recentVisits: (visits.data as { id: number; check_in: string; check_out: string | null; method: string }[]).map(
      (v) => ({ id: v.id, checkIn: v.check_in, checkOut: v.check_out, method: v.method }),
    ),
    totalVisits: total.count ?? 0,
    visitsLast30Days: recent.count ?? 0,
    progress: (items.data as { id: number; sort: number; title: string }[]).map((item) => ({
      ...item,
      doneOn: ticked.get(item.id)?.done_on ?? null,
      remark: ticked.get(item.id)?.remark ?? null,
    })),
    calls: (
      calls.data as {
        id: string;
        called_at: string;
        outcome: CallOutcome;
        reason: string | null;
        comment: string;
        next_date: string | null;
        coordinator_id: string;
      }[]
    ).map((c) => ({
      id: c.id,
      calledAt: c.called_at,
      outcome: c.outcome,
      reason: c.reason,
      comment: c.comment,
      nextDate: c.next_date,
      coordinatorId: c.coordinator_id,
    })),
    openTasks: (
      tasks.data as {
        id: string;
        kind: 'call' | 'retry';
        due_on: string;
        attempt: number;
        escalated: boolean;
        assignee_id: string | null;
      }[]
    ).map((task) => ({
      id: task.id,
      kind: task.kind,
      dueOn: task.due_on,
      attempt: task.attempt,
      escalated: task.escalated,
      assigneeId: task.assignee_id,
    })),
    levelHistory: (
      levels.data as {
        id: number;
        from_level: number | null;
        to_level: number;
        changed_on: string;
        approved_by: string | null;
      }[]
    ).map((l) => ({
      id: l.id,
      fromLevel: l.from_level,
      toLevel: l.to_level,
      changedOn: l.changed_on,
      approvedBy: l.approved_by,
    })),
    guardians: (
      guardians.data as { id: string; full_name: string; phone: string | null; email: string | null; relation: string | null }[]
    ).map((g) => ({ id: g.id, fullName: g.full_name, phone: g.phone, email: g.email, relation: g.relation })),
    consents: (
      consents.data as {
        id: string;
        scope: Consent['scope'];
        method: Consent['method'];
        id_type_checked: string | null;
        given_at: string;
        revoked_at: string | null;
      }[]
    ).map((c) => ({
      id: c.id,
      scope: c.scope,
      method: c.method,
      idTypeChecked: c.id_type_checked,
      givenAt: c.given_at,
      revokedAt: c.revoked_at,
    })),
  };
}

/** True when a minor has a current (not withdrawn) consent for their data. */
export function hasDataConsent(consents: readonly Consent[]): boolean {
  return consents.some((c) => c.scope === 'data' && c.revokedAt === null);
}

