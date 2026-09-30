// The numbers on the three home screens: S1 student home, C1 coordinator dashboard and G1 Guru
// dashboard. Each screen's numbers come from one database function (student_home,
// coordinator_dashboard, guru_dashboard in supabase/migrations/0009_home_screens.sql). They count
// in the database, with the row-level security of the person asking, so a home screen opens with
// one request and the phone never downloads every student and visit (docs/DECISIONS.md #31).
// Read-only: nothing in this file writes.
//
// Words used here mean the same as in the migration: "this week" = Monday to today in India;
// "new joiner" = joined in the last settings.new_joiner_weeks weeks and not Left; "in class" =
// not Left; "overdue" = an open follow-up task past its date.

import { supabase } from '@/lib/supabase';

import type { StudentStatus } from './student-overview';

// ---------------------------------------------------------------- S1 student home

/** The signed-in student's own numbers for the student home. */
export type StudentHome = {
  fullName: string;
  rollNo: string | null;
  levelId: number;
  status: StudentStatus;
  /** 'YYYY-MM-DD'. */
  joinedOn: string;
  /** ISO timestamp of the last check-in, or null if the student has never come. */
  lastVisitAt: string | null;
  /** Whole days (India time) since the last visit, or since joining when there is none. */
  daysSinceVisit: number;
  /** Checked in right now. */
  hereNow: boolean;
  /** Check-ins since Monday, India time. */
  visitsThisWeek: number;
  /** Ticked items of the student's current level, and how many items that level has. */
  syllabusDone: number;
  syllabusTotal: number;
};

type StudentHomeRow = {
  full_name: string;
  roll_no: string | null;
  level_id: number;
  status: StudentStatus;
  joined_on: string;
  last_visit_at: string | null;
  days_since_visit: number;
  here_now: boolean;
  visits_this_week: number;
  syllabus_done: number;
  syllabus_total: number;
};

/**
 * Loads the signed-in student's home numbers. Returns 'not_found' when the login is not linked to
 * a student record, null when they could not be loaded (usually no internet).
 */
export async function fetchStudentHome(): Promise<StudentHome | 'not_found' | null> {
  const { data, error } = await supabase.rpc('student_home');
  if (error) return null;
  const row = data as StudentHomeRow | null;
  if (!row) return 'not_found';
  return {
    fullName: row.full_name,
    rollNo: row.roll_no,
    levelId: row.level_id,
    status: row.status,
    joinedOn: row.joined_on,
    lastVisitAt: row.last_visit_at,
    daysSinceVisit: row.days_since_visit,
    hereNow: row.here_now,
    visitsThisWeek: row.visits_this_week,
    syllabusDone: row.syllabus_done,
    syllabusTotal: row.syllabus_total,
  };
}

// ---------------------------------------------------------------- C1 coordinator dashboard

/** A student in their first weeks, for the coordinator to greet and keep an eye on. */
export type NewJoiner = {
  id: string;
  fullName: string;
  rollNo: string;
  levelId: number;
  /** 'YYYY-MM-DD'. */
  joinedOn: string;
  /** Visits since joining. A new joiner with none yet may need a call. */
  visits: number;
};

/** Everything the coordinator dashboard shows. */
export type CoordinatorDashboard = {
  /** Open visits now, as on "Who is here now" (C6). */
  hereNow: number;
  /** Check-ins since midnight in India, as on "Mark attendance" (C5). */
  visitsToday: number;
  /**
   * My students with a follow-up call due today or earlier, or already handed to the Guru: the
   * task is mine or I am their mentor, as "My students" on the follow-up queue (C10).
   */
  myCallsDue: number;
  /** settings.new_joiner_weeks: how many weeks someone counts as a new joiner. */
  newJoinerWeeks: number;
  newJoinerCount: number;
  /** The newest new joiners first; at most 50. */
  newJoiners: NewJoiner[];
};

type CoordinatorDashboardRow = {
  here_now: number;
  visits_today: number;
  my_calls_due: number;
  new_joiner_weeks: number;
  new_joiner_count: number;
  new_joiners: {
    id: string;
    full_name: string;
    roll_no: string;
    level_id: number;
    joined_on: string;
    visits: number;
  }[];
};

/**
 * Loads the coordinator dashboard (coordinators and the Guru). Returns null when it could not be
 * loaded (usually no internet).
 */
export async function fetchCoordinatorDashboard(): Promise<CoordinatorDashboard | null> {
  const { data, error } = await supabase.rpc('coordinator_dashboard');
  if (error || !data) return null;
  const row = data as CoordinatorDashboardRow;
  return {
    hereNow: row.here_now,
    visitsToday: row.visits_today,
    myCallsDue: row.my_calls_due,
    newJoinerWeeks: row.new_joiner_weeks,
    newJoinerCount: row.new_joiner_count,
    newJoiners: row.new_joiners.map((j) => ({
      id: j.id,
      fullName: j.full_name,
      rollNo: j.roll_no,
      levelId: j.level_id,
      joinedOn: j.joined_on,
      visits: j.visits,
    })),
  };
}

// ---------------------------------------------------------------- G1 Guru dashboard

/** Follow-ups that need attention, for one coordinator (or for students with no mentor). */
export type FollowUpLoad = {
  /** Profile id of the person the tasks are assigned to; null = the students had no mentor. */
  assigneeId: string | null;
  /** Their name, or null when there is no assignee. */
  fullName: string | null;
  /** Students whose call is past its date and not yet handed to the Guru. */
  overdue: number;
  /** Students handed to the Guru (three failed tries, or no call by the time they went Inactive). */
  escalated: number;
};

/** Everything the Guru dashboard shows. */
export type GuruDashboard = {
  /** 'YYYY-MM-DD' of this week's Monday. */
  weekStart: string;
  /** Students who came at least once since Monday; each counts once. */
  cameThisWeek: number;
  /** Every student who is not Left. */
  inClass: number;
  newJoinerWeeks: number;
  newJoiners: number;
  /** Students in class per level, every level in order, also those with nobody. */
  byLevel: { levelId: number; name: string; students: number }[];
  /** All students (Left too) per status, in the order new, active ... left. */
  byStatus: { status: StudentStatus; students: number }[];
  /** Only people with something overdue or escalated; most urgent first. */
  followUps: FollowUpLoad[];
};

type GuruDashboardRow = {
  week_start: string;
  came_this_week: number;
  in_class: number;
  new_joiner_weeks: number;
  new_joiners: number;
  by_level: { level_id: number; name: string; students: number }[];
  by_status: { status: StudentStatus; students: number }[];
  follow_ups: { assignee_id: string | null; full_name: string | null; overdue: number; escalated: number }[];
};

/** Loads the Guru dashboard (Guru only). Returns null when it could not be loaded. */
export async function fetchGuruDashboard(): Promise<GuruDashboard | null> {
  const { data, error } = await supabase.rpc('guru_dashboard');
  if (error || !data) return null;
  const row = data as GuruDashboardRow;
  return {
    weekStart: row.week_start,
    cameThisWeek: row.came_this_week,
    inClass: row.in_class,
    newJoinerWeeks: row.new_joiner_weeks,
    newJoiners: row.new_joiners,
    byLevel: row.by_level.map((l) => ({ levelId: l.level_id, name: l.name, students: l.students })),
    byStatus: row.by_status,
    followUps: row.follow_ups.map((f) => ({
      assigneeId: f.assignee_id,
      fullName: f.full_name,
      overdue: f.overdue,
      escalated: f.escalated,
    })),
  };
}
