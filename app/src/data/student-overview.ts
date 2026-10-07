// The student list as staff see it (screen C7, and the follow-up queue C10): one summary per
// student with level, status, mentor and how long since their last visit, plus the search and
// filters. Reads the student_overview view (supabase/migrations/0005_students_follow_up.sql),
// which works out the last visit in the database; row-level security still applies to it.

import { searchFold } from '@/lib/search-text';
import { supabase } from '@/lib/supabase';

/** A student's status, as in the student_status type of the database (docs/DATABASE.md). */
export const STUDENT_STATUSES = ['new', 'active', 'irregular', 'inactive', 'paused', 'left'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** One row of student_overview. */
export type StudentSummary = {
  id: string;
  rollNo: string;
  fullName: string;
  levelId: number;
  status: StudentStatus;
  /** 'YYYY-MM-DD' a paused student comes back into follow-up, else null. */
  pausedUntil: string | null;
  /** Profile id of the mentor coordinator, or null when none is set yet. */
  mentorId: string | null;
  /** 'YYYY-MM-DD'. */
  joinedOn: string;
  /** ISO timestamp of the last check-in, or null if the student has never come. */
  lastVisitAt: string | null;
  /**
   * Whole days (the class's time) since the last visit, or since joining when there is none. Counted
   * the same way as the daily job that moves students to Irregular and Inactive.
   */
  daysSinceVisit: number;
  /** Checked in now (an open visit). */
  hereNow: boolean;
};

type OverviewRow = {
  id: string;
  roll_no: string;
  full_name: string;
  level_id: number;
  status: StudentStatus;
  paused_until: string | null;
  mentor_id: string | null;
  joined_on: string;
  last_visit_at: string | null;
  days_since_visit: number;
  here_now: boolean;
};

/** Columns read from student_overview, in the order of OverviewRow. */
export const OVERVIEW_COLUMNS =
  'id, roll_no, full_name, level_id, status, paused_until, mentor_id, joined_on, last_visit_at, days_since_visit, here_now';

/** Turns a student_overview row into the app's shape. */
export function toStudentSummary(row: OverviewRow): StudentSummary {
  return {
    id: row.id,
    rollNo: row.roll_no,
    fullName: row.full_name,
    levelId: row.level_id,
    status: row.status,
    pausedUntil: row.paused_until,
    mentorId: row.mentor_id,
    joinedOn: row.joined_on,
    lastVisitAt: row.last_visit_at,
    daysSinceVisit: row.days_since_visit,
    hereNow: row.here_now,
  };
}

/**
 * Loads every student the signed-in person may see, by name. Returns null when it could not be
 * loaded (usually no internet).
 *
 * All students come in one request and are filtered on the phone, so typing in the search box
 * answers at once, without waiting for the network. That suits a class of a few hundred; Supabase
 * returns at most 1,000 rows per request, so a much bigger class would need the filters sent to
 * the database instead.
 */
export async function fetchStudentSummaries(): Promise<StudentSummary[] | null> {
  const { data, error } = await supabase.from('student_overview').select(OVERVIEW_COLUMNS).order('full_name');
  if (error) return null;
  return (data as OverviewRow[]).map(toStudentSummary);
}

// ---------------------------------------------------------------- staff names

/** A coordinator or the Guru, for mentor names and "who logged this call". */
export type StaffMember = { id: string; fullName: string; role: 'guru' | 'coordinator'; active: boolean };

/**
 * Loads the Guru and all coordinators, including switched-off ones, whose names still appear on
 * old call logs. Returns null when it could not be loaded.
 */
export async function fetchStaff(): Promise<StaffMember[] | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .in('role', ['guru', 'coordinator'])
    .order('full_name');
  if (error) return null;
  return (data as { id: string; full_name: string; role: 'guru' | 'coordinator'; active: boolean }[]).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    role: p.role,
    active: p.active,
  }));
}

// ---------------------------------------------------------------- search and filters

/**
 * The filters on the student list. 'all' (or 0 for `absentDays`) means "do not filter on this".
 * `mentor` is a profile id, 'mine' (the signed-in coordinator's mentees) or 'none' (no mentor yet).
 */
export type StudentFilters = {
  search: string;
  levelId: number | 'all';
  status: StudentStatus | 'all';
  mentor: string | 'all' | 'mine' | 'none';
  /** Only students not seen for at least this many days. */
  absentDays: number;
};

/** The choices offered for "not seen for": any time, or at least this many days. */
export const ABSENT_DAY_CHOICES = [0, 7, 14, 30] as const;

/** No filter set: every student. */
export const NO_FILTERS: StudentFilters = { search: '', levelId: 'all', status: 'all', mentor: 'all', absentDays: 0 };

/** Lower case, no Latin accents, single spaces, no spaces at the ends: what the search compares. */
function normalise(text: string): string {
  return searchFold(text);
}

/**
 * True when the student matches the search text: part of the name, or part of the roll number
 * (so "0012" finds MS-2026-0012). An empty search matches everyone.
 */
export function matchesSearch(student: StudentSummary, search: string): boolean {
  const query = normalise(search);
  if (!query) return true;
  return normalise(student.fullName).includes(query) || student.rollNo.toLowerCase().includes(query);
}

/**
 * The students that pass every filter, in the order given. `myId` is the signed-in person's
 * profile id, used by the 'mine' mentor filter.
 */
export function filterStudents(
  students: readonly StudentSummary[],
  filters: StudentFilters,
  myId: string | null,
): StudentSummary[] {
  return students.filter((s) => {
    if (!matchesSearch(s, filters.search)) return false;
    if (filters.levelId !== 'all' && s.levelId !== filters.levelId) return false;
    if (filters.status !== 'all' && s.status !== filters.status) return false;
    if (filters.mentor === 'mine' && (myId === null || s.mentorId !== myId)) return false;
    if (filters.mentor === 'none' && s.mentorId !== null) return false;
    if (!['all', 'mine', 'none'].includes(filters.mentor) && s.mentorId !== filters.mentor) return false;
    if (s.daysSinceVisit < filters.absentDays) return false;
    return true;
  });
}

/** How many filters other than the search are set, for the "Filters (2)" button. */
export function countActiveFilters(filters: StudentFilters): number {
  return [
    filters.levelId !== 'all',
    filters.status !== 'all',
    filters.mentor !== 'all',
    filters.absentDays > 0,
  ].filter(Boolean).length;
}
