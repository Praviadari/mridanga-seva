// Practice tools (Phase 2 slice 3, docs/DECISIONS.md #54): the taals the player loops (S5, V1), the
// Guru's taal editor, and the practice log (S6) with weekly totals for S4 My progress and C8.
// Database: supabase/migrations/0018_practice.sql. Row-level security: everyone signed in reads the
// taals switched on, staff all of them, only the Guru writes; a student reads their own practice
// and staff everyone's, and practice is written only through log_practice / delete_practice.
//
// The player must work offline, so the last taals loaded are kept on this device, and the seeded
// placeholder taals are built in as a last resort (a phone that never reached the server).

import { readLocal, writeLocal } from '@/lib/local-storage';
import { supabase } from '@/lib/supabase';

import { isNetworkError, type MessageKey } from './errors';

/** One taal (table taals). */
export type Taal = {
  id: number;
  name: string;
  /** One entry per beat: '-' rest, or bols joined with '.'. */
  bols: string[];
  beats: number;
  /** Beats per vibhag. */
  divisions: number[];
  /** One per vibhag: 'X' sam, '2'-'9' tali, '0' khali. */
  marks: string[];
  /** null = every level. */
  levelId: number | null;
  placeholder: boolean;
  note: string | null;
  sort: number;
  active: boolean;
};

type TaalRow = {
  id: number;
  name: string;
  bols: string[];
  beats: number;
  divisions: number[];
  marks: string[];
  level_id: number | null;
  placeholder: boolean;
  note: string | null;
  sort: number;
  active: boolean;
};

const TAAL_COLUMNS = 'id, name, bols, beats, divisions, marks, level_id, placeholder, note, sort, active';

function taalOf(row: TaalRow): Taal {
  return {
    id: row.id,
    name: row.name,
    bols: row.bols,
    beats: row.beats,
    divisions: row.divisions,
    marks: row.marks,
    levelId: row.level_id,
    placeholder: row.placeholder,
    note: row.note,
    sort: row.sort,
    active: row.active,
  };
}

/**
 * The three placeholders seeded by 0018, for a phone that has never loaded the taals (ids below 0:
 * not in the database, never logged with a practice entry).
 */
export const BUILT_IN_TAALS: readonly Taal[] = [
  {
    id: -1, name: 'Kirtan 8 beats', bols: ['tā', '-', '-', 'ka', 'tā', 'ghe', 'ghe', '-'], beats: 8, divisions: [4, 4],
    marks: ['X', '0'], levelId: 1, placeholder: true, note: null, sort: 1, active: true,
  },
  {
    id: -2, name: 'Six beats', bols: ['dhā', 'tā', 'tā', 'ka', 'tā', 'tā'], beats: 6, divisions: [3, 3],
    marks: ['X', '0'], levelId: 1, placeholder: true, note: null, sort: 2, active: true,
  },
  {
    id: -3, name: 'Dasapahira 16 beats',
    bols: ['dhā', 'ti', 'tā', 'tā', 'ra', 'ti', 'ra', 'ti', 'tā', 'ki', 'ti', 'ki', 'tā', 'ghe', 'dhā', 'dhin'],
    beats: 16, divisions: [8, 4, 4], marks: ['X', '0', '2'], levelId: null, placeholder: true, note: null, sort: 3, active: true,
  },
];

/** Device storage key for the last taals loaded. */
const SAVED_TAALS_KEY = 'practiceTaals';

/** The taals to play. `saved` = the server could not be reached; a copy from this phone is shown. */
export type TaalList = { taals: Taal[]; saved: boolean };

/** Loads the taals in their order (staff get the switched-off ones too), keeping a copy on the device. */
export async function fetchTaals(): Promise<TaalList> {
  const { data, error } = await supabase.from('taals').select(TAAL_COLUMNS).order('sort').order('id');
  if (!error) {
    const taals = (data as TaalRow[]).map(taalOf);
    writeLocal(SAVED_TAALS_KEY, JSON.stringify(taals.filter((t) => t.active)));
    return { taals, saved: false };
  }
  try {
    const saved = JSON.parse(readLocal(SAVED_TAALS_KEY) ?? 'null') as Taal[] | null;
    if (Array.isArray(saved) && saved.length > 0) return { taals: saved, saved: true };
  } catch {
    // a broken copy: fall through to the built-in ones
  }
  return { taals: [...BUILT_IN_TAALS], saved: true };
}

/** The Guru's taal list: every taal, switched off too. null = could not be loaded. */
export async function fetchAllTaals(): Promise<Taal[] | null> {
  const { data, error } = await supabase.from('taals').select(TAAL_COLUMNS).order('sort').order('id');
  return error ? null : (data as TaalRow[]).map(taalOf);
}

/** One taal for the editor. null = not found or could not be loaded. */
export async function fetchTaal(id: number): Promise<Taal | null> {
  const { data, error } = await supabase.from('taals').select(TAAL_COLUMNS).eq('id', id).maybeSingle<TaalRow>();
  return error || !data ? null : taalOf(data);
}

/** What the Guru types in the editor. */
export type TaalInput = {
  name: string;
  bols: string[];
  divisions: number[];
  marks: string[];
  levelId: number | null;
  placeholder: boolean;
  note: string;
  sort: number;
  active: boolean;
};

const TAAL_CODES = [
  'taal_name_invalid', 'taal_beats_invalid', 'taal_divisions_invalid', 'taal_marks_invalid', 'taal_bols_invalid', 'taal_note_too_long',
] as const;

function taalErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = TAAL_CODES.find((c) => message === c);
  if (code) return `taals.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'taals.errors.not_allowed';
  return 'common.genericError';
}

/** Saves a taal (new when `id` is null). Returns its id or the message to show. */
export async function saveTaal(id: number | null, input: TaalInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    name: input.name,
    bols: input.bols,
    divisions: input.divisions,
    marks: input.marks,
    level_id: input.levelId,
    placeholder: input.placeholder,
    note: input.note,
    sort: input.sort,
    active: input.active,
  };
  const query = id === null
    ? supabase.from('taals').insert(row).select('id').single<{ id: number }>()
    : supabase.from('taals').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: taalErrorKey(error?.message) };
  return { id: data.id };
}

/** Deletes a taal; practice already logged with it keeps its minutes. */
export async function deleteTaal(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('taals').delete().eq('id', id);
  return error ? taalErrorKey(error.message) : null;
}

// ---------------------------------------------------------------- practice log

/** One practice entry (table practice_logs). */
export type PracticeEntry = {
  id: number;
  /** 'YYYY-MM-DD', at the class. */
  practisedOn: string;
  minutes: number;
  source: 'timer' | 'manual';
  taalId: number | null;
  note: string | null;
};

/** Minutes of one week (from Monday, at the class), newest week first. */
export type PracticeWeek = { weekStart: string; minutes: number; entries: number };

const PRACTICE_CODES = [
  'not_allowed', 'minutes_invalid', 'started_invalid', 'date_invalid', 'taal_not_found', 'note_too_long', 'day_full', 'too_many', 'too_old',
] as const;

function practiceErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = PRACTICE_CODES.find((c) => message === c);
  if (code) return `practiceLog.errors.${code}` as MessageKey;
  return 'common.genericError';
}

/** What to log: from the S5 timer (startedAt) or typed in (practisedOn). */
export type PracticeInput = {
  minutes: number;
  source: 'timer' | 'manual';
  practisedOn?: string;
  startedAt?: string;
  taalId?: number | null;
  note?: string;
};

/** Logs practice for the signed-in student. null = saved, else the message to show. */
export async function logPractice(input: PracticeInput): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('log_practice', {
    p_minutes: input.minutes,
    p_source: input.source,
    p_practised_on: input.practisedOn ?? null,
    p_started_at: input.startedAt ?? null,
    // Built-in taals (id < 0) are not in the database.
    p_taal: input.taalId && input.taalId > 0 ? input.taalId : null,
    p_note: input.note ?? null,
  });
  return error ? practiceErrorKey(error.message) : null;
}

/** Deletes one of the student's own entries of the last 14 days. */
export async function deletePractice(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('delete_practice', { p_id: id });
  return error ? practiceErrorKey(error.message) : null;
}

/** Weekly minutes of one student, `weeks` weeks, newest first. null = could not be loaded. */
export async function fetchPracticeWeeks(studentId: string, weeks: number): Promise<PracticeWeek[] | null> {
  const { data, error } = await supabase.rpc('practice_weeks', { p_student: studentId, p_weeks: weeks });
  if (error) return null;
  return (data as { week_start: string; minutes: number; entries: number }[]).map((w) => ({
    weekStart: w.week_start,
    minutes: w.minutes,
    entries: w.entries,
  }));
}

/** The signed-in student's record id; 'not_found' when the login has none, null on failure. */
export async function fetchMyStudentId(profileId: string): Promise<string | 'not_found' | null> {
  const { data, error } = await supabase.from('students').select('id').eq('profile_id', profileId).maybeSingle<{ id: string }>();
  if (error) return null;
  return data ? data.id : 'not_found';
}

/** What S6 shows: the weeks and the entries of the last 8 weeks, newest first. */
export type PracticeLog = { studentId: string; weeks: PracticeWeek[]; entries: PracticeEntry[] };

/** S6: the signed-in student's log. */
export async function fetchMyPracticeLog(profileId: string): Promise<PracticeLog | 'not_found' | null> {
  const studentId = await fetchMyStudentId(profileId);
  if (studentId === null || studentId === 'not_found') return studentId;
  const [weeks, rows] = await Promise.all([
    fetchPracticeWeeks(studentId, 8),
    supabase
      .from('practice_logs')
      .select('id, practised_on, minutes, source, taal_id, note')
      .eq('student_id', studentId)
      .order('practised_on', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
  ]);
  if (!weeks || rows.error) return null;
  const entries = (rows.data as { id: number; practised_on: string; minutes: number; source: 'timer' | 'manual'; taal_id: number | null; note: string | null }[])
    .filter((r) => r.practised_on >= weeks[weeks.length - 1].weekStart)
    .map((r) => ({ id: r.id, practisedOn: r.practised_on, minutes: r.minutes, source: r.source, taalId: r.taal_id, note: r.note }));
  return { studentId, weeks, entries };
}
