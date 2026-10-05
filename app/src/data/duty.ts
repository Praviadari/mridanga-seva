// C20 Duty roster (Phase 2 slice 8, docs/DECISIONS.md #65): duty shifts per date and centre,
// inside the centre's open hours, with the coordinators on each. The Guru plans them (one shift,
// or the same shift for up to 12 weeks); coordinators see the roster and their own shifts, and
// get a reminder the evening before (duty_daily, migration 0023). The database checks every rule
// again: open hours, no past dates, only active coordinators, Guru-only changes.

import type { ParseKeys, TFunction } from 'i18next';

import { formatDayMonthYear, todayInIndia } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** Longest duty text, as in the database. */
export const DUTY_MAX = 80;
/** Most weeks a new shift repeats. */
export const MAX_WEEKS = 12;

/** "Sat 10-10-2026": the weekday in the app's language and the date (YYYY-MM-DD in). */
export function dayText(t: TFunction, isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return `${t(`duty.weekdays.${weekday}` as 'duty.weekdays.0')} ${formatDayMonthYear(isoDate)}`;
}

/** One shift. Times are 'HH:MM'. */
export type Shift = {
  id: number;
  centreId: number;
  centreName: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  duty: string | null;
  people: { id: string; name: string }[];
};

type Row = {
  id: number;
  centre_id: number;
  on_date: string;
  starts_at: string;
  ends_at: string;
  duty: string | null;
  centre: { name: string } | null;
  duty_assignments: { profile: { id: string; full_name: string } | null }[];
};

const COLUMNS =
  'id, centre_id, on_date, starts_at, ends_at, duty, centre:centres(name), ' +
  'duty_assignments(profile:profiles!duty_assignments_profile_id_fkey(id, full_name))';

function toShift(row: Row): Shift {
  return {
    id: row.id,
    centreId: row.centre_id,
    centreName: row.centre?.name ?? '',
    onDate: row.on_date,
    startsAt: row.starts_at.slice(0, 5),
    endsAt: row.ends_at.slice(0, 5),
    duty: row.duty,
    people: row.duty_assignments
      .flatMap((a) => (a.profile ? [{ id: a.profile.id, name: a.profile.full_name }] : []))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Shifts from today for `days` days, by date and time. null = could not be loaded. */
export async function fetchRoster(days = 28): Promise<Shift[] | null> {
  const from = todayInIndia();
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('duty_shifts')
    .select(COLUMNS)
    .gte('on_date', from)
    .lt('on_date', to)
    .order('on_date')
    .order('starts_at');
  if (error) return null;
  return (data as unknown as Row[]).map(toShift);
}

/** One shift, for the Guru's form. */
export async function fetchShift(id: number): Promise<Shift | 'not_found' | null> {
  const { data, error } = await supabase.from('duty_shifts').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) return null;
  return data ? toShift(data as unknown as Row) : 'not_found';
}

/** The people who can be on duty: active coordinators and the Guru, by name. */
export async function fetchDutyPeople(): Promise<{ id: string; name: string; role: 'guru' | 'coordinator' }[] | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['guru', 'coordinator'])
    .eq('active', true)
    .order('full_name');
  if (error) return null;
  return (data as { id: string; full_name: string; role: 'guru' | 'coordinator' }[]).map((p) => ({
    id: p.id,
    name: p.full_name,
    role: p.role,
  }));
}

/** What the shift form holds. Date as YYYY-MM-DD, times as HH:MM. */
export type ShiftForm = {
  centreId: number;
  onDate: string;
  startsAt: string;
  endsAt: string;
  duty: string;
  people: string[];
  weeks: number;
};

/** Saves a shift (id null = new, repeated `weeks` times). */
export async function saveShift(id: number | null, form: ShiftForm): Promise<{ errorKey?: ParseKeys }> {
  if (form.people.length === 0) return { errorKey: 'duty.errors.people_required' };
  if (form.duty.trim().length > DUTY_MAX) return { errorKey: 'duty.errors.duty_too_long' };
  const { error } = await supabase.rpc('save_duty_shift', {
    p_id: id,
    p_centre: form.centreId,
    p_date: form.onDate,
    p_starts: form.startsAt,
    p_ends: form.endsAt,
    p_duty: form.duty.trim() || null,
    p_people: form.people,
    p_weeks: id === null ? form.weeks : 1,
  });
  return error ? { errorKey: dutyErrorKey(error.message, error.code) } : {};
}

/** Deletes a shift. */
export async function deleteShift(id: number): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('duty_shifts').delete().eq('id', id);
  return error ? { errorKey: dutyErrorKey(error.message, error.code) } : {};
}

const KNOWN = [
  'time_invalid',
  'outside_hours',
  'date_past',
  'date_too_far',
  'duty_too_long',
  'not_a_coordinator',
  'people_required',
  'weeks_invalid',
  'shift_not_found',
] as const;

/** Turns a database error into a translation key. */
export function dutyErrorKey(message: string, code: string | undefined): ParseKeys {
  const known = KNOWN.find((k) => k === message);
  if (known) return `duty.errors.${known}`;
  if (code === '42501' || message === 'not_allowed') return 'duty.errors.not_allowed';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
