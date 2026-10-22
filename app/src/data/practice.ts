// Practice tools (Phase 2 slice 3, docs/DECISIONS.md #54): the taals the player loops (S5, V1), the
// Guru's taal editor, and the practice log (S6) with weekly totals for S4 My progress and C8.
// Since 0052 (#400-#401): practice per day with the level's weekly goal, and the practice of the week per level.
// Database: supabase/migrations/0018_practice.sql. Row-level security: everyone signed in reads the
// taals switched on, staff all of them, only the Guru writes; a student reads their own practice
// and staff everyone's, and practice is written only through log_practice / delete_practice.
//
// The player must work offline, so the last taals loaded are kept on this device, and the seeded
// placeholder taals are built in as a last resort (a phone that never reached the server).

import { readLocal, writeLocal } from '@/lib/local-storage';
import { DEFAULT_GOAL, type PracticeDay, type PracticeGoal } from '@/lib/practice-goal';
import { supabase } from '@/lib/supabase';

import { rpcOnce } from './create-once';
import { fallbackErrorKey, isNetworkError, type MessageKey } from './errors';

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
  return fallbackErrorKey(message);
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

/**
 * Logs practice for the signed-in student. null = saved, else the message to show. equestId: the
 * entry's own id (#322), so Stop or Save tapped again after a lost answer logs it once.
 */
export async function logPractice(input: PracticeInput, requestId: string): Promise<MessageKey | null> {
  const { error } = await rpcOnce('log_practice', {
    p_request_id: requestId,
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

/**
 * A student's practice per day and their weekly goal (practice_days, migration 0052; #400). `own` = the student set
 * it; else it is their level's or the default.
 */
export type PracticeDays = { goal: PracticeGoal; own: boolean; days: PracticeDay[] };

/** How many weeks of days the goal card reads: enough for a year's weeks in a row. */
const GOAL_WEEKS = 53;

/** Practice per day of the last year with the goal. null = could not be loaded (or 0052 has not run). */
export async function fetchPracticeDays(studentId: string): Promise<PracticeDays | null> {
  const { data, error } = await supabase.rpc('practice_days', { p_student: studentId, p_weeks: GOAL_WEEKS });
  if (error || !data) return null;
  const row = data as { goal_days: number; goal_minutes: number; goal_own?: boolean; days: { on: string; minutes: number }[] };
  return {
    goal: { days: row.goal_days ?? DEFAULT_GOAL.days, minutes: row.goal_minutes ?? DEFAULT_GOAL.minutes },
    own: row.goal_own === true,
    days: (row.days ?? []).map((d) => ({ on: d.on, minutes: d.minutes })),
  };
}

/** The signed-in student sets their own weekly goal, or (null) goes back to the class's. null = saved. */
export async function setMyPracticeGoal(goal: PracticeGoal | null): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('set_my_practice_goal', { p_days: goal?.days ?? null, p_minutes: goal?.minutes ?? null });
  return error ? planErrorKey(error.message) : null;
}

// ---------------------------------------------------------------- practice of the week (0052, #401)

/** One thing to practise: a taal at a tempo, or a lesson video. */
export type PlanItem = { kind: 'taal'; taalId: number; bpm: number } | { kind: 'lesson'; materialId: number };

/** A level's practice of the week (table practice_plans). */
export type PracticePlan = {
  levelId: number;
  goal: PracticeGoal;
  note: string | null;
  items: PlanItem[];
  updatedAt: string | null;
};

/** Most items in a plan, as in the database. */
export const MAX_PLAN_ITEMS = 3;
/** Longest note, as in the database. */
export const PLAN_NOTE_MAX = 300;

type PlanRow = {
  level_id: number;
  goal_days: number;
  goal_minutes: number;
  note: string | null;
  items: ({ taal: number; bpm: number } | { lesson: number })[];
  updated_at: string | null;
};

const PLAN_COLUMNS = 'level_id, goal_days, goal_minutes, note, items, updated_at';

function planOf(row: PlanRow): PracticePlan {
  return {
    levelId: row.level_id,
    goal: { days: row.goal_days, minutes: row.goal_minutes },
    note: row.note,
    items: (row.items ?? []).flatMap((item): PlanItem[] =>
      'taal' in item ? [{ kind: 'taal', taalId: item.taal, bpm: item.bpm }] : 'lesson' in item ? [{ kind: 'lesson', materialId: item.lesson }] : [],
    ),
    updatedAt: row.updated_at,
  };
}

/** The plan of a level that has none yet: the default goal, nothing to practise. */
export function emptyPlan(levelId: number): PracticePlan {
  return { levelId, goal: { ...DEFAULT_GOAL }, note: null, items: [], updatedAt: null };
}

/** A lesson video named in a plan: its title, when the reader may open it. */
export type PlanLesson = { id: number; title: string };

/** What the student's Practice tools show: the plan of their level and its lessons they can open. */
export type MyPracticePlan = { studentId: string; plan: PracticePlan; lessons: Map<number, PlanLesson> };

/** Titles of the lesson videos among `ids` that the reader may open (row-level security of materials). */
async function planLessons(ids: number[]): Promise<Map<number, PlanLesson>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('materials').select('id, title, kind').in('id', ids);
  if (error || !data) return new Map();
  return new Map(
    (data as { id: number; title: string; kind: string }[])
      .filter((m) => m.kind === 'youtube' || m.kind === 'video')
      .map((m) => [m.id, { id: m.id, title: m.title }]),
  );
}

/**
 * The signed-in student's practice of the week (their level's). 'not_found' = no student record, null = could not be
 * loaded (or 0052 has not run): the screen then shows no plan.
 */
export async function fetchMyPracticePlan(profileId: string): Promise<MyPracticePlan | 'not_found' | null> {
  const { data: me, error } = await supabase.from('students').select('id, level_id').eq('profile_id', profileId).maybeSingle<{ id: string; level_id: number }>();
  if (error) return null;
  if (!me) return 'not_found';
  const { data, error: planError } = await supabase.from('practice_plans').select(PLAN_COLUMNS).eq('level_id', me.level_id).maybeSingle<PlanRow>();
  if (planError) return null;
  const plan = data ? planOf(data) : emptyPlan(me.level_id);
  const lessons = await planLessons(plan.items.flatMap((i) => (i.kind === 'lesson' ? [i.materialId] : [])));
  return { studentId: me.id, plan, lessons };
}

/** Every level's plan for the staff editor (levels without a row get the empty plan). null = could not be loaded. */
export async function fetchPracticePlans(levelIds: readonly number[]): Promise<Map<number, PracticePlan> | null> {
  const { data, error } = await supabase.from('practice_plans').select(PLAN_COLUMNS);
  if (error) return null;
  const found = new Map((data as PlanRow[]).map((row) => [row.level_id, planOf(row)]));
  return new Map(levelIds.map((id) => [id, found.get(id) ?? emptyPlan(id)]));
}

const PLAN_CODES = [
  'plan_goal_invalid', 'plan_note_too_long', 'plan_items_invalid', 'plan_bpm_invalid', 'plan_taal_not_found', 'plan_lesson_not_found',
] as const;

function planErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = PLAN_CODES.find((c) => message === c);
  if (code) return `practicePlan.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'practicePlan.errors.not_allowed';
  return fallbackErrorKey(message);
}

/** Saves a level's plan (staff). null = saved, else the message to show. */
export async function savePracticePlan(plan: PracticePlan): Promise<MessageKey | null> {
  const { error } = await supabase.from('practice_plans').upsert(
    {
      level_id: plan.levelId,
      goal_days: plan.goal.days,
      goal_minutes: plan.goal.minutes,
      note: plan.note ?? '',
      items: plan.items.map((i) => (i.kind === 'taal' ? { taal: i.taalId, bpm: i.bpm } : { lesson: i.materialId })),
    },
    { onConflict: 'level_id' },
  );
  return error ? planErrorKey(error.message) : null;
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
