// The whole student database as the Guru sees it on G3: every student record with the columns a
// laptop table shows (roll number, name, level, status, mentor, area, phone, joined, app login),
// filtered by level, status, mentor and area on the device. C7 stays the everyday list; G3 is for
// checking and cleaning the records, and is where the Excel import starts (student-import.ts).

import { supabase } from '@/lib/supabase';

import type { StudentStatus } from './student-overview';

/** One student record on G3. */
export type DatabaseRow = {
  id: string;
  rollNo: string;
  fullName: string;
  levelId: number;
  status: StudentStatus;
  mentorId: string | null;
  area: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  joinedOn: string;
  hasLogin: boolean;
};

/** Loads every student record, by roll number. Null = could not load. */
export async function fetchStudentDatabase(): Promise<DatabaseRow[] | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, roll_no, full_name, level_id, status, mentor_id, area, pincode, phone, email, joined_on, profile_id')
    .order('roll_no');
  if (error) return null;
  return (
    data as {
      id: string;
      roll_no: string;
      full_name: string;
      level_id: number;
      status: StudentStatus;
      mentor_id: string | null;
      area: string | null;
      pincode: string | null;
      phone: string | null;
      email: string | null;
      joined_on: string;
      profile_id: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    rollNo: r.roll_no,
    fullName: r.full_name,
    levelId: r.level_id,
    status: r.status,
    mentorId: r.mentor_id,
    area: r.area,
    pincode: r.pincode,
    phone: r.phone,
    email: r.email,
    joinedOn: r.joined_on,
    hasLogin: r.profile_id !== null,
  }));
}

/** G3's filters; 'all' = no filter. `mentor` is a profile id or 'none'; `area` an area as written (any case). */
export type DatabaseFilters = {
  search: string;
  levelId: number | 'all';
  status: StudentStatus | 'all';
  mentor: string | 'all' | 'none';
  area: string | 'all';
};

export const NO_DATABASE_FILTERS: DatabaseFilters = { search: '', levelId: 'all', status: 'all', mentor: 'all', area: 'all' };

/** An area's spelling for comparing: "abids ", "Abids" and "ABIDS" are one area. */
export function areaKey(area: string | null): string {
  return (area ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The areas in the records with how many students each, most first; "" = no area written. */
export function areasOf(rows: readonly DatabaseRow[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { key: string; label: string; count: number }>();
  for (const row of rows) {
    const key = areaKey(row.area);
    const entry = byKey.get(key) ?? { key, label: (row.area ?? '').trim(), count: 0 };
    entry.count++;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The rows that pass every filter. The search matches name, roll number, phone or email. */
export function filterDatabase(rows: readonly DatabaseRow[], f: DatabaseFilters): DatabaseRow[] {
  const query = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (
      query &&
      !r.fullName.toLowerCase().includes(query) &&
      !r.rollNo.toLowerCase().includes(query) &&
      !(r.phone ?? '').includes(query) &&
      !(r.email ?? '').toLowerCase().includes(query)
    ) {
      return false;
    }
    if (f.levelId !== 'all' && r.levelId !== f.levelId) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.mentor === 'none' && r.mentorId !== null) return false;
    if (f.mentor !== 'all' && f.mentor !== 'none' && r.mentorId !== f.mentor) return false;
    if (f.area !== 'all' && areaKey(r.area) !== f.area) return false;
    return true;
  });
}
