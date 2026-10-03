// C21 My reports (a coordinator: their mentees) and G8 Reports (the Guru: everyone, or one
// coordinator's mentees) for a date range: statuses now, new joiners and Left in the range, visits
// per week and per month, follow-up calls done and due, syllabus progress per level, and one row
// per student, which is also what the CSV file holds. Counted in the database by class_report
// (migration 0015) the same way as the home screens (docs/DECISIONS.md #50). Migration 0024 adds the
// check-ins flagged by the location check, in total, by reason and per student (#70).

import type { ParseKeys, TFunction } from 'i18next';

import { levelName, statusName } from '@/i18n/labels';
import { formatDayMonthYear, todayInIndia } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { StudentStatus } from './student-overview';

import { isNetworkError } from './errors';

/** One week's or month's visits. */
export type VisitPeriod = { start: string; visits: number; visitors: number; hours: number };

/** Progress of the students at one level. */
export type LevelProgress = {
  levelId: number;
  name: string;
  /** Items in use at the level. */
  items: number;
  students: number;
  /** Average share of the level's items ticked, 0-100. */
  avgPercent: number;
  /** Students with every item ticked. */
  complete: number;
  /** Ticks given in the range. */
  ticksInRange: number;
};

/** One student's line. */
export type ReportRow = {
  id: string;
  rollNo: string;
  fullName: string;
  levelId: number;
  status: StudentStatus;
  mentorName: string | null;
  joinedOn: string;
  lastVisitOn: string | null;
  daysSinceVisit: number;
  visits: number;
  hours: number;
  calls: number;
  syllabusDone: number;
  syllabusTotal: number;
  /** Check-ins in the range flagged by the location check. */
  flagged: number;
};

/** The whole report. */
export type ClassReport = {
  from: string;
  to: string;
  weekStarts: 'monday' | 'rolling7';
  mentorId: string | null;
  students: number;
  inClass: number;
  byStatus: { status: StudentStatus; students: number }[];
  newJoiners: number;
  leftInRange: number;
  visits: number;
  visitors: number;
  hours: number;
  /** Check-ins in the range flagged by the location check (outside the area, no position). */
  visitsFlagged: number;
  flaggedByReason: { reason: string; visits: number }[];
  byWeek: VisitPeriod[];
  byMonth: VisitPeriod[];
  callsDone: number;
  callsByOutcome: { outcome: string; calls: number }[];
  callsDue: number;
  callsEscalated: number;
  callsPlanned: number;
  byLevel: LevelProgress[];
  rows: ReportRow[];
};

/** The ranges offered as chips; "custom" shows two date fields. */
export type RangeChoice = 'thisMonth' | 'lastMonth' | 'last4Weeks' | 'last3Months' | 'custom';

/** First and last day ('YYYY-MM-DD', India) of a range choice. */
export function rangeOf(choice: Exclude<RangeChoice, 'custom'>): { from: string; to: string } {
  const today = todayInIndia();
  const [y, m] = today.split('-').map(Number);
  const day = (year: number, month: number, d: number) => {
    const at = new Date(Date.UTC(year, month - 1, d));
    return at.toISOString().slice(0, 10);
  };
  const minusDays = (iso: string, n: number) => {
    const at = new Date(`${iso}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - n);
    return at.toISOString().slice(0, 10);
  };
  switch (choice) {
    case 'thisMonth':
      return { from: day(y, m, 1), to: today };
    case 'lastMonth':
      return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case 'last4Weeks':
      return { from: minusDays(today, 27), to: today };
    case 'last3Months':
      return { from: day(y, m - 2, 1), to: today };
  }
}

type Raw = {
  from: string;
  to: string;
  week_starts: 'monday' | 'rolling7';
  mentor_id: string | null;
  students: number;
  in_class: number;
  by_status: { status: StudentStatus; students: number }[];
  new_joiners: number;
  left_in_range: number;
  visits: number;
  visitors: number;
  hours: number;
  /** Missing before migration 0024. */
  visits_flagged?: number;
  flagged_by_reason?: { reason: string; visits: number }[] | null;
  by_week: VisitPeriod[];
  by_month: VisitPeriod[];
  calls_done: number;
  calls_by_outcome: { outcome: string; calls: number }[];
  calls_due: number;
  calls_escalated: number;
  calls_planned: number;
  by_level: { level_id: number; name: string; items: number; students: number; avg_percent: number; complete: number; ticks_in_range: number }[];
  rows: {
    id: string;
    roll_no: string;
    full_name: string;
    level_id: number;
    status: StudentStatus;
    mentor_name: string | null;
    joined_on: string;
    last_visit_on: string | null;
    days_since_visit: number;
    visits: number;
    hours: number;
    calls: number;
    syllabus_done: number;
    syllabus_total: number;
    flagged?: number;
  }[];
};

/**
 * Loads the report for `from`-`to` ('YYYY-MM-DD'). The Guru may pass a coordinator's id to see
 * their mentees only; a coordinator always gets their own mentees.
 */
export async function fetchReport(from: string, to: string, mentorId: string | null): Promise<{ report?: ClassReport; errorKey?: ParseKeys }> {
  const { data, error } = await supabase.rpc('class_report', { p_from: from, p_to: to, p_mentor: mentorId });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const r = data as Raw;
  return {
    report: {
      from: r.from,
      to: r.to,
      weekStarts: r.week_starts,
      mentorId: r.mentor_id,
      students: r.students,
      inClass: r.in_class,
      byStatus: r.by_status,
      newJoiners: r.new_joiners,
      leftInRange: r.left_in_range,
      visits: r.visits,
      visitors: r.visitors,
      hours: Number(r.hours),
      visitsFlagged: r.visits_flagged ?? 0,
      flaggedByReason: r.flagged_by_reason ?? [],
      byWeek: r.by_week.map((w) => ({ ...w, hours: Number(w.hours) })),
      byMonth: r.by_month.map((w) => ({ ...w, hours: Number(w.hours) })),
      callsDone: r.calls_done,
      callsByOutcome: r.calls_by_outcome,
      callsDue: r.calls_due,
      callsEscalated: r.calls_escalated,
      callsPlanned: r.calls_planned,
      byLevel: r.by_level.map((l) => ({
        levelId: l.level_id,
        name: l.name,
        items: l.items,
        students: l.students,
        avgPercent: Number(l.avg_percent),
        complete: l.complete,
        ticksInRange: l.ticks_in_range,
      })),
      rows: r.rows.map((s) => ({
        id: s.id,
        rollNo: s.roll_no,
        fullName: s.full_name,
        levelId: s.level_id,
        status: s.status,
        mentorName: s.mentor_name,
        joinedOn: s.joined_on,
        lastVisitOn: s.last_visit_on,
        daysSinceVisit: s.days_since_visit,
        visits: s.visits,
        hours: Number(s.hours),
        calls: s.calls,
        syllabusDone: s.syllabus_done,
        syllabusTotal: s.syllabus_total,
        flagged: s.flagged ?? 0,
      })),
    },
  };
}

/** The file name of the CSV: mridanga-seva-report-<from>-to-<to>.csv. */
export function reportFileName(report: ClassReport): string {
  return `mridanga-seva-report-${report.from}-to-${report.to}.csv`;
}

/**
 * The CSV rows: a few lines with the range and the totals, then one line per student, with
 * headings in the app's language (Excel reads them as they are). Dates as day-month-year.
 */
export function reportCsvRows(report: ClassReport, t: TFunction): (string | number | null)[][] {
  const date = (iso: string | null) => (iso ? formatDayMonthYear(iso) : '');
  return [
    [t('reports.csv.range'), date(report.from), date(report.to)],
    [t('reports.csv.totals'), t('reports.visits'), report.visits, t('reports.visitors'), report.visitors, t('reports.hours'), report.hours, t('attendanceLocation.csvColumn'), report.visitsFlagged],
    [],
    [
      t('database.columns.roll'),
      t('database.columns.name'),
      t('database.columns.level'),
      t('database.columns.status'),
      t('database.columns.mentor'),
      t('database.columns.joined'),
      t('reports.csv.visits'),
      t('reports.csv.hours'),
      t('reports.csv.lastVisit'),
      t('reports.csv.daysAway'),
      t('reports.csv.calls'),
      t('reports.csv.syllabusDone'),
      t('reports.csv.syllabusTotal'),
      t('attendanceLocation.csvColumn'),
    ],
    ...report.rows.map((s) => [
      s.rollNo,
      s.fullName,
      levelName(t, s.levelId),
      statusName(t, s.status),
      s.mentorName ?? '',
      date(s.joinedOn),
      s.visits,
      s.hours,
      date(s.lastVisitOn),
      s.daysSinceVisit,
      s.calls,
      s.syllabusDone,
      s.syllabusTotal,
      s.flagged,
    ]),
  ];
}

function errorKeyOf(message: string): ParseKeys {
  switch (message) {
    case 'not_allowed':
      return 'reports.errors.notAllowed';
    case 'range_invalid':
      return 'reports.errors.range';
    case 'range_too_long':
      return 'reports.errors.tooLong';
  }
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
