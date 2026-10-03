// Promotion approval (Phase 2, slice 2): a coordinator nominates a student for the next level
// (C22) after the criteria check, other coordinators answer Ready / Almost / Not yet with a
// comment (C23), and the Guru decides on the level-up queue (G7): Promote, Not yet with guidance
// and a date, or More feedback. The app never promotes anyone by itself.
//
// Everything goes through database functions that check the rules and queue the notifications:
// promotion_criteria, nominate_for_promotion, give_promotion_feedback, decide_promotion,
// withdraw_nomination, promotion_ready_students, promotion_home; the list is the view
// promotion_queue. Staff only (supabase/migrations/0017_promotion.sql, docs/DECISIONS.md #53).

import type { ParseKeys } from 'i18next';

import { formatDayMonthYear, parseDayMonthYear, todayInIndia } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { parseMediaFile, type MediaFile } from './assessment-files';
import { isNetworkError } from './errors';
import { fetchStaff } from './student-overview';

/** A translation key for a message. */
type MessageKey = ParseKeys;

export const REASON_MAX = 2000;
export const COMMENT_MAX = 1000;
export const NOTE_MAX = 2000;

/** A coordinator's answer (C23). */
export const RATINGS = ['ready', 'almost', 'not_yet'] as const;
export type Rating = (typeof RATINGS)[number];

/** Where a nomination stands. */
export type NominationStatus = 'open' | 'promoted' | 'not_yet' | 'withdrawn';

/** The Guru's three answers (G7). */
export type Decision = 'promote' | 'not_yet' | 'more';

/** The accepted level-up recording the criteria check found. */
export type LevelUpFound = {
  submissionId: number;
  assignmentId: number;
  assessmentId: number;
  title: string;
  score: number | null;
  scoreMax: number | null;
  reviewedAt: string | null;
};

/** The criteria check of one student (promotion_criteria), from the settings promotion_*. */
export type Criteria = {
  levelId: number;
  nextLevelId: number | null;
  syllabusDone: number;
  syllabusTotal: number;
  syllabusPercent: number;
  syllabusOk: boolean;
  visits: number;
  visitsNeeded: number;
  visitWeeks: number;
  visitsOk: boolean;
  levelUpNeeded: boolean;
  levelUp: LevelUpFound | null;
  levelUpOk: boolean;
  allOk: boolean;
  /** Only on a fresh check, not on the copy kept with a nomination. */
  openNominationId: number | null;
  /** 'YYYY-MM-DD': after "not yet", no new nomination until the day after. */
  renominateAfter: string | null;
  /** Active coordinators who taught the student lately, and the mentor. */
  taughtBy: string[];
};

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : fallback);
const bool = (value: unknown): boolean => value === true;

/** Reads promotion_criteria() or a nomination's kept copy. */
export function parseCriteria(value: unknown): Criteria | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  const lu = c.level_up && typeof c.level_up === 'object' ? (c.level_up as Record<string, unknown>) : null;
  return {
    levelId: num(c.level_id, 1),
    nextLevelId: typeof c.next_level_id === 'number' ? c.next_level_id : null,
    syllabusDone: num(c.syllabus_done),
    syllabusTotal: num(c.syllabus_total),
    syllabusPercent: num(c.syllabus_percent, 100),
    syllabusOk: bool(c.syllabus_ok),
    visits: num(c.visits),
    visitsNeeded: num(c.visits_needed, 8),
    visitWeeks: num(c.visit_weeks, 8),
    visitsOk: bool(c.visits_ok),
    levelUpNeeded: c.level_up_needed !== false,
    levelUp: lu
      ? {
          submissionId: num(lu.submission_id),
          assignmentId: num(lu.assignment_id),
          assessmentId: num(lu.assessment_id),
          title: typeof lu.title === 'string' ? lu.title : '',
          score: typeof lu.score === 'number' ? lu.score : null,
          scoreMax: typeof lu.score_max === 'number' ? lu.score_max : null,
          reviewedAt: typeof lu.reviewed_at === 'string' ? lu.reviewed_at : null,
        }
      : null,
    levelUpOk: bool(c.level_up_ok),
    allOk: bool(c.all_ok),
    openNominationId: typeof c.open_nomination_id === 'number' ? c.open_nomination_id : null,
    renominateAfter: typeof c.renominate_after === 'string' ? c.renominate_after : null,
    taughtBy: Array.isArray(c.taught_by) ? c.taught_by.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** Turns an error from the database into a translation key: the codes of migration 0017. */
const KNOWN_CODES = [
  'not_allowed', 'student_not_found', 'top_level', 'already_nominated', 'too_soon', 'reason_required',
  'reason_too_long', 'nomination_not_found', 'nomination_closed', 'rating_invalid', 'comment_required',
  'comment_too_long', 'decision_invalid', 'feedback_needed', 'level_changed', 'note_required', 'note_too_long',
  'date_required', 'date_past', 'date_too_far', 'level_guru_only',
] as const;

function errorKeyOf(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = KNOWN_CODES.find((c) => message === c);
  if (code) return `promotion.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'promotion.errors.not_allowed';
  return 'common.genericError';
}

/** The criteria check of one student; a message key when it failed. */
export async function fetchCriteria(studentId: string): Promise<{ criteria?: Criteria; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('promotion_criteria', { p_student: studentId });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const criteria = parseCriteria(data);
  return criteria ? { criteria } : { errorKey: 'common.genericError' };
}

// ---------------------------------------------------------------- the queue (G7) and the home counts

/** One nomination on the list (view promotion_queue). */
export type NominationItem = {
  id: number;
  studentId: string;
  fullName: string;
  rollNo: string;
  currentLevel: number;
  fromLevel: number;
  toLevel: number;
  reason: string;
  criteria: Criteria | null;
  submissionId: number | null;
  asked: string[];
  nominatedBy: string | null;
  nominatedByName: string | null;
  nominatedAt: string;
  status: NominationStatus;
  moreAskedAt: string | null;
  moreNote: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  guidance: string | null;
  /** 'YYYY-MM-DD'. */
  renominateAfter: string | null;
  answers: number;
  ready: number;
  almost: number;
  notYet: number;
  lastAnswerAt: string | null;
  answersNeeded: number;
};

type QueueRow = {
  id: number;
  student_id: string;
  full_name: string;
  roll_no: string;
  current_level: number;
  from_level: number;
  to_level: number;
  reason: string;
  criteria: unknown;
  submission_id: number | null;
  asked: string[] | null;
  nominated_by: string | null;
  nominated_at: string;
  status: NominationStatus;
  more_asked_at: string | null;
  more_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  guidance: string | null;
  renominate_after: string | null;
  answers: number;
  ready: number;
  almost: number;
  not_yet: number;
  last_answer_at: string | null;
  answers_needed: number;
};

const QUEUE_COLUMNS =
  'id, student_id, full_name, roll_no, current_level, from_level, to_level, reason, criteria, submission_id, asked, nominated_by, nominated_at, status, more_asked_at, more_note, decided_by, decided_at, guidance, renominate_after, answers, ready, almost, not_yet, last_answer_at, answers_needed';

function toItem(row: QueueRow, names: Map<string, string>): NominationItem {
  return {
    id: row.id,
    studentId: row.student_id,
    fullName: row.full_name,
    rollNo: row.roll_no,
    currentLevel: row.current_level,
    fromLevel: row.from_level,
    toLevel: row.to_level,
    reason: row.reason,
    criteria: parseCriteria(row.criteria),
    submissionId: row.submission_id,
    asked: row.asked ?? [],
    nominatedBy: row.nominated_by,
    nominatedByName: row.nominated_by ? (names.get(row.nominated_by) ?? null) : null,
    nominatedAt: row.nominated_at,
    status: row.status,
    moreAskedAt: row.more_asked_at,
    moreNote: row.more_note,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by ? (names.get(row.decided_by) ?? null) : null,
    decidedAt: row.decided_at,
    guidance: row.guidance,
    renominateAfter: row.renominate_after,
    answers: row.answers,
    ready: row.ready,
    almost: row.almost,
    notYet: row.not_yet,
    lastAnswerAt: row.last_answer_at,
    answersNeeded: row.answers_needed,
  };
}

/** True when enough coordinators have answered for the Guru to promote. */
export function hasEnoughAnswers(item: Pick<NominationItem, 'answers' | 'answersNeeded'>): boolean {
  return item.answers >= item.answersNeeded;
}

/** A student who meets every criterion and could be nominated now. */
export type ReadyStudent = { studentId: string; fullName: string; rollNo: string; levelId: number };

/** The list screen: open and recently decided nominations, the students ready, my open answers. */
export type PromotionList = {
  open: NominationItem[];
  decided: NominationItem[];
  ready: ReadyStudent[];
  /** Ids of open nominations the signed-in coordinator has answered. */
  answeredByMe: Set<number>;
};

/** Loads the list (G7 for the Guru, the coordinators' Promotions); null when it could not load. */
export async function fetchPromotionList(myId: string): Promise<PromotionList | null> {
  const [open, decided, ready, mine, staff] = await Promise.all([
    supabase.from('promotion_queue').select(QUEUE_COLUMNS).eq('status', 'open').order('nominated_at'),
    supabase.from('promotion_queue').select(QUEUE_COLUMNS).neq('status', 'open').order('decided_at', { ascending: false }).limit(20),
    supabase.rpc('promotion_ready_students'),
    supabase.from('promotion_feedback').select('nomination_id').eq('coordinator_id', myId),
    fetchStaff(),
  ]);
  if (open.error || decided.error || ready.error || mine.error) return null;
  const names = new Map((staff ?? []).map((s) => [s.id, s.fullName]));
  return {
    open: (open.data as QueueRow[]).map((r) => toItem(r, names)),
    decided: (decided.data as QueueRow[]).map((r) => toItem(r, names)),
    ready: (ready.data as { student_id: string; full_name: string; roll_no: string; level_id: number }[]).map((r) => ({
      studentId: r.student_id,
      fullName: r.full_name,
      rollNo: r.roll_no,
      levelId: r.level_id,
    })),
    answeredByMe: new Set((mine.data as { nomination_id: number }[]).map((r) => r.nomination_id)),
  };
}

/** The numbers for the staff homes (promotion_home). */
export type PromotionHome = { toDecide: number; collecting: number; toAnswer: number; ready: number };

export async function fetchPromotionHome(): Promise<PromotionHome | null> {
  const { data, error } = await supabase.rpc('promotion_home');
  if (error || !data) return null;
  const h = data as Record<string, unknown>;
  return { toDecide: num(h.to_decide), collecting: num(h.collecting), toAnswer: num(h.to_answer), ready: num(h.ready) };
}

// ---------------------------------------------------------------- one nomination (C23, G7)

/** One coordinator's answer. */
export type Answer = { coordinatorId: string; name: string | null; rating: Rating; comment: string; updatedAt: string };

/** The level-up recording kept with a nomination. */
export type LevelUpRecording = {
  submissionId: number;
  assignmentId: number;
  file: MediaFile | null;
  link: string | null;
  score: number | null;
  scoreMax: number | null;
  comment: string | null;
  reviewedByName: string | null;
  fileRemovedAt: string | null;
};

/** One nomination with everything around it. */
export type NominationDetail = {
  item: NominationItem;
  answers: Answer[];
  recording: LevelUpRecording | null;
  /** Names of the coordinators asked. */
  askedNames: string[];
};

/** Loads one nomination; 'not_found' when it is not there or not visible; null offline. */
export async function fetchNomination(id: number): Promise<NominationDetail | 'not_found' | null> {
  const [one, answers, staff] = await Promise.all([
    supabase.from('promotion_queue').select(QUEUE_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('promotion_feedback').select('coordinator_id, rating, comment, updated_at').eq('nomination_id', id).order('created_at'),
    fetchStaff(),
  ]);
  if (one.error || answers.error) return null;
  if (!one.data) return 'not_found';
  const names = new Map((staff ?? []).map((s) => [s.id, s.fullName]));
  const item = toItem(one.data as QueueRow, names);
  let recording: LevelUpRecording | null = null;
  if (item.submissionId !== null) {
    const sub = await supabase
      .from('assessment_submissions')
      .select('id, assignment_id, file, link, score, score_max, comment, reviewed_by, file_removed_at')
      .eq('id', item.submissionId)
      .maybeSingle();
    if (sub.error) return null;
    if (sub.data) {
      const s = sub.data as {
        id: number; assignment_id: number; file: unknown; link: string | null; score: number | null; score_max: number | null;
        comment: string | null; reviewed_by: string | null; file_removed_at: string | null;
      };
      recording = {
        submissionId: s.id,
        assignmentId: s.assignment_id,
        file: parseMediaFile(s.file),
        link: s.link,
        score: s.score,
        scoreMax: s.score_max,
        comment: s.comment,
        reviewedByName: s.reviewed_by ? (names.get(s.reviewed_by) ?? null) : null,
        fileRemovedAt: s.file_removed_at,
      };
    }
  }
  return {
    item,
    answers: (answers.data as { coordinator_id: string; rating: Rating; comment: string; updated_at: string }[]).map((a) => ({
      coordinatorId: a.coordinator_id,
      name: names.get(a.coordinator_id) ?? null,
      rating: a.rating,
      comment: a.comment,
      updatedAt: a.updated_at,
    })),
    recording,
    askedNames: item.asked.map((pid) => names.get(pid)).filter((n): n is string => !!n),
  };
}

/** C23: the signed-in coordinator's answer (a second one replaces the first). */
export async function giveFeedback(id: number, rating: Rating, comment: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('give_promotion_feedback', { p_nomination: id, p_rating: rating, p_comment: comment.trim() });
  return error ? errorKeyOf(error.message) : undefined;
}

/** G7: the Guru's decision. `after` is typed day-month-year (Not yet only). */
export async function decide(id: number, decision: Decision, note: string, after: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('decide_promotion', {
    p_nomination: id,
    p_decision: decision,
    p_note: note.trim() || null,
    p_renominate_after: decision === 'not_yet' ? parseDayMonthYear(after) : null,
  });
  return error ? errorKeyOf(error.message) : undefined;
}

export type DecisionErrors = Partial<Record<'note' | 'date', MessageKey>>;

/** Checks the G7 form as the database will. */
export function checkDecision(decision: Decision, note: string, after: string): DecisionErrors {
  const errors: DecisionErrors = {};
  if (decision !== 'promote' && !note.trim()) {
    errors.note = decision === 'more' ? 'promotion.errors.more_note_required' : 'promotion.errors.note_required';
  }
  if (note.trim().length > NOTE_MAX) errors.note = 'promotion.errors.note_too_long';
  if (decision === 'not_yet') {
    const day = parseDayMonthYear(after);
    if (!after.trim()) errors.date = 'promotion.errors.date_required';
    else if (!day) errors.date = 'promotion.decide.dateInvalid';
    else if (day <= todayInIndia()) errors.date = 'promotion.errors.date_past';
  }
  return errors;
}

/** The nominator or the Guru takes back an open nomination. */
export async function withdraw(id: number): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('withdraw_nomination', { p_nomination: id });
  return error ? errorKeyOf(error.message) : undefined;
}

// ---------------------------------------------------------------- C22: nominate

/** A coordinator who can be asked for feedback. */
export type Askable = { id: string; fullName: string; taught: boolean };

/** What the nominate screen needs. */
export type NominateOptions = {
  student: { id: string; fullName: string; rollNo: string; levelId: number };
  criteria: Criteria;
  coordinators: Askable[];
  /** Answers needed before the Guru can promote (setting promotion_min_feedback, default 2). */
  answersNeeded: number;
};

/** Loads C22 for one student; 'not_found' when the student is not visible; null offline. */
export async function fetchNominateOptions(studentId: string, myId: string): Promise<NominateOptions | 'not_found' | null> {
  const [student, check, staff, needed] = await Promise.all([
    supabase.from('students').select('id, full_name, roll_no, level_id').eq('id', studentId).maybeSingle(),
    fetchCriteria(studentId),
    fetchStaff(),
    supabase.from('settings').select('value').eq('key', 'promotion_min_feedback').maybeSingle(),
  ]);
  if (student.error || !staff) return null;
  if (!student.data) return 'not_found';
  if (!check.criteria) return check.errorKey === 'promotion.errors.student_not_found' ? 'not_found' : null;
  const s = student.data as { id: string; full_name: string; roll_no: string; level_id: number };
  const taught = new Set(check.criteria.taughtBy);
  return {
    student: { id: s.id, fullName: s.full_name, rollNo: s.roll_no, levelId: s.level_id },
    criteria: check.criteria,
    coordinators: staff
      .filter((p) => p.role === 'coordinator' && p.active && p.id !== myId)
      .map((p) => ({ id: p.id, fullName: p.fullName, taught: taught.has(p.id) }))
      .sort((a, b) => Number(b.taught) - Number(a.taught) || a.fullName.localeCompare(b.fullName)),
    answersNeeded: num((needed.data as { value?: unknown } | null)?.value, 2),
  };
}

/** C22: nominates; returns the new nomination's id or a message key. */
export async function nominate(studentId: string, reason: string, ask: string[]): Promise<{ id?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('nominate_for_promotion', { p_student: studentId, p_reason: reason.trim(), p_ask: ask });
  if (error) return { errorKey: errorKeyOf(error.message) };
  return { id: data as number };
}

/** A date for the Not yet form: today plus `days`, written day-month-year. */
export function dateInDays(days: number): string {
  const [y, m, d] = todayInIndia().split('-').map(Number);
  return formatDayMonthYear(new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10));
}
