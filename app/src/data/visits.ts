// S9 Attendance history: one student's visits by month, newest first, with the time in and out
// and the hours of each month. The same list is opened for staff from C8 Student profile.
// Row-level security lets a student read only their own visits and staff read everyone's
// (policy own_or_staff on visits, supabase/migrations/0001_phase1.sql). Staff also see a check-in's
// location result (0024, DECISIONS #70); the student's own screen does not show it.

import { supabase } from '@/lib/supabase';

import { dateInIndia, todayInIndia } from '@/lib/dates';

import type { LocationCheck } from './attendance';

/** One visit. `checkOut` is null while the student is still at the centre. */
export type HistoryVisit = {
  id: number;
  checkIn: string;
  checkOut: string | null;
  /** The location check at check-in (staff only see it). */
  locationCheck: LocationCheck;
  distanceM: number | null;
};

/** The visits of one month in India, newest first. */
export type VisitMonth = {
  /** 'YYYY-MM'. */
  month: string;
  visits: HistoryVisit[];
  /** Minutes at the centre in the finished visits. */
  minutes: number;
};

/** What the history screen shows. */
export type VisitHistory = {
  months: VisitMonth[];
  /** True when there are visits before the months loaded ("Show earlier months"). */
  hasEarlier: boolean;
};

/** How many months the screen loads at first, and adds each time "Show earlier months" is tapped. */
export const MONTHS_PER_PAGE = 3;

/** 'YYYY-MM' of the month `back` months before this month in India. */
function monthBefore(back: number): string {
  const [year, month] = todayInIndia().split('-').map(Number);
  const index = year * 12 + (month - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Loads the visits of the last `months` months (this month included) of one student. Months
 * without a visit are left out. null = could not be loaded (usually no internet).
 */
export async function fetchVisitHistory(studentId: string, months: number): Promise<VisitHistory | null> {
  const since = `${monthBefore(months - 1)}-01T00:00:00+05:30`;
  const [visits, earlier] = await Promise.all([
    supabase
      .from('visits')
      .select('id, check_in, check_out, location_check, location_distance_m')
      .eq('student_id', studentId)
      .gte('check_in', since)
      .order('check_in', { ascending: false }),
    supabase.from('visits').select('id').eq('student_id', studentId).lt('check_in', since).limit(1),
  ]);
  if (visits.error || earlier.error) return null;

  const byMonth = new Map<string, VisitMonth>();
  for (const row of visits.data as {
    id: number;
    check_in: string;
    check_out: string | null;
    location_check: LocationCheck;
    location_distance_m: number | null;
  }[]) {
    const month = dateInIndia(row.check_in).slice(0, 7);
    const entry = byMonth.get(month) ?? { month, visits: [], minutes: 0 };
    entry.visits.push({
      id: row.id,
      checkIn: row.check_in,
      checkOut: row.check_out,
      locationCheck: row.location_check,
      distanceM: row.location_distance_m,
    });
    if (row.check_out) entry.minutes += Math.round((Date.parse(row.check_out) - Date.parse(row.check_in)) / 60_000);
    byMonth.set(month, entry);
  }
  return { months: [...byMonth.values()], hasEarlier: earlier.data.length > 0 };
}

/** The signed-in student's own record, for S9 and A3. */
export type MyStudent = { id: string; rollNo: string; fullName: string };

/** The student record of a login. 'not_found' when it has none, null when it could not be loaded. */
export async function fetchMyStudent(profileId: string): Promise<MyStudent | 'not_found' | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, roll_no, full_name')
    .eq('profile_id', profileId)
    .maybeSingle<{ id: string; roll_no: string; full_name: string }>();
  if (error) return null;
  return data ? { id: data.id, rollNo: data.roll_no, fullName: data.full_name } : 'not_found';
}
