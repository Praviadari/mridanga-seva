// Assessments (Phase 2, slice 1): the Guru creates one and sends it to the coordinators (G6); a
// coordinator releases it to students with a due date and notes (C12) and follows up on the
// tracker with Remind (C13); the student opens it, sends a recording and reads the feedback (S7);
// a coordinator reviews it by the rubric, accepts it or asks for a redo (C14).
//
// The Guru writes the assessments table directly (insert, send = set sent_at, delete while not
// released). Everything else goes through database functions that check the rules and queue the
// push notifications: release_assessment, mark_assessment_seen, submit_assessment,
// review_submission, remind_assessment. Row-level security decides who sees what: the Guru
// everything, coordinators what was sent to them, a student only their own
// (supabase/migrations/0016_assessments.sql, docs/DECISIONS.md #52).

import type { ParseKeys } from 'i18next';

import { formatTypedDate, parseDayMonthYear, todayLocal } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import {
  MAX_MEDIA,
  parseMedia,
  parseMediaFile,
  removeMedia,
  uploadMedia,
  type MediaFile,
  type PickedMedia,
} from './assessment-files';
import { isNetworkError } from './errors';
import { fetchStudentSummaries, type StudentSummary } from './student-overview';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest texts and sizes of the assessment forms (G6, C12, S7, C14); the database checks them too. */
export const TITLE_MAX = 120;
export const INSTRUCTIONS_MAX = 4000;
export const NOTES_MAX = 2000;
export const NOTE_MAX = 1000;
export const COMMENT_MAX = 2000;
export const CRITERION_MAX = 80;
export const RUBRIC_MAX_LINES = 8;
export const SCORE_TOP_MAX = 10;

/** Types of assessment, as stored in assessments.kind. */
export const ASSESSMENT_KINDS = ['playing', 'singing', 'theory', 'other'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

/**
 * Where a student is with an assessment: assigned (Not seen), seen, submitted (waiting for the
 * review), reviewed (accepted), redo (asked to record again).
 */
export const ASSIGNMENT_STATUSES = ['assigned', 'seen', 'submitted', 'reviewed', 'redo'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Statuses in which the student still has to send something; Remind reaches only these. */
export const OPEN_STATUSES: readonly AssignmentStatus[] = ['assigned', 'seen', 'redo'];

/** One line of a rubric: what is scored and its top score. */
export type RubricLine = { criterion: string; max: number };

/** One assessment. */
export type Assessment = {
  id: number;
  title: string;
  instructions: string;
  kind: AssessmentKind;
  levelId: number;
  levelUp: boolean;
  rubric: RubricLine[];
  media: MediaFile[];
  mediaLink: string | null;
  createdBy: string | null;
  createdAt: string;
  /** When the Guru sent it to the coordinators; null = draft (only the Guru sees it). */
  sentAt: string | null;
};

/** How many students have it in each state (view assessment_summary). */
export type AssessmentCounts = Record<AssignmentStatus, number> & { total: number };

type AssessmentRow = {
  id: number;
  title: string;
  instructions: string;
  kind: AssessmentKind;
  level_id: number;
  level_up: boolean;
  rubric: unknown;
  media: unknown;
  media_link: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
};

const ASSESSMENT_COLUMNS = 'id, title, instructions, kind, level_id, level_up, rubric, media, media_link, created_by, created_at, sent_at';

/** Reads assessments.rubric, keeping only well-formed lines. */
function parseRubric(value: unknown): RubricLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { criterion, max } = item as Record<string, unknown>;
    return typeof criterion === 'string' && typeof max === 'number' ? [{ criterion, max }] : [];
  });
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    kind: row.kind,
    levelId: row.level_id,
    levelUp: row.level_up,
    rubric: parseRubric(row.rubric),
    media: parseMedia(row.media),
    mediaLink: row.media_link,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

/** The top score of a rubric (sum of its lines). */
export function rubricTotal(rubric: RubricLine[]): number {
  return rubric.reduce((sum, line) => sum + line.max, 0);
}

/** Turns an error from the database into a translation key: the codes of migration 0016. */
const KNOWN_CODES = [
  'not_allowed', 'title_required', 'title_too_long', 'instructions_too_long', 'rubric_required', 'rubric_invalid',
  'too_many_media', 'file_invalid', 'file_not_yours', 'file_missing', 'link_invalid', 'already_sent',
  'assessment_released', 'assessment_not_found', 'students_required', 'due_required', 'due_past', 'due_too_far',
  'notes_too_long', 'nothing_to_assign', 'not_open', 'recording_required', 'note_too_long', 'submission_not_found',
  'already_reviewed', 'outcome_required', 'scores_invalid', 'comment_required', 'comment_too_long',
  'level_up_not_allowed',
] as const;

function errorKeyOf(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = KNOWN_CODES.find((c) => message === c);
  if (code) return `assessments.errors.${code}` as MessageKey;
  if (/row-level security|permission denied|violates foreign key/i.test(message)) return 'assessments.errors.not_allowed';
  return 'common.genericError';
}

/** Names of the Guru and the coordinators by profile id (staff_names, docs/DECISIONS.md #26). */
async function fetchStaffNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('staff_names');
  if (error || !data) return new Map();
  return new Map((data as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]));
}

// ---------------------------------------------------------------- staff: the list (C12) and one assessment

/** One assessment on the staff list, with its counts. */
export type StaffAssessmentItem = { assessment: Assessment; counts: AssessmentCounts };

function toCounts(row: Partial<Record<'assigned' | 'not_seen' | 'seen' | 'submitted' | 'reviewed' | 'redo', number>> | undefined): AssessmentCounts {
  return {
    total: row?.assigned ?? 0,
    assigned: row?.not_seen ?? 0,
    seen: row?.seen ?? 0,
    submitted: row?.submitted ?? 0,
    reviewed: row?.reviewed ?? 0,
    redo: row?.redo ?? 0,
  };
}

/**
 * Every assessment the signed-in staff member may see, newest first: the Guru's drafts too, for a
 * coordinator only those sent. Null when it could not be loaded.
 */
export async function fetchStaffAssessments(): Promise<StaffAssessmentItem[] | null> {
  const [list, sums] = await Promise.all([
    supabase.from('assessments').select(ASSESSMENT_COLUMNS).order('created_at', { ascending: false }).limit(200),
    supabase.from('assessment_summary').select('assessment_id, assigned, not_seen, seen, submitted, reviewed, redo'),
  ]);
  if (list.error || sums.error) return null;
  const byId = new Map((sums.data as { assessment_id: number }[]).map((s) => [s.assessment_id, s]));
  return (list.data as AssessmentRow[]).map((row) => ({
    assessment: toAssessment(row),
    counts: toCounts(byId.get(row.id) as Parameters<typeof toCounts>[0]),
  }));
}

/** One student on the tracker (view assessment_tracker). */
export type TrackerRow = {
  assignmentId: number;
  releaseId: number;
  studentId: string;
  fullName: string;
  rollNo: string;
  levelId: number;
  hasLogin: boolean;
  status: AssignmentStatus;
  seenAt: string | null;
  lastRemindedAt: string | null;
  reminders: number;
  /** 'YYYY-MM-DD'. */
  dueOn: string;
  submissionId: number | null;
  submittedAt: string | null;
  score: number | null;
  scoreMax: number | null;
  sendLevelUp: boolean;
};

type TrackerDbRow = {
  assignment_id: number;
  release_id: number;
  student_id: string;
  full_name: string;
  roll_no: string;
  level_id: number;
  has_login: boolean;
  status: AssignmentStatus;
  seen_at: string | null;
  last_reminded_at: string | null;
  reminders: number;
  due_on: string;
  submission_id: number | null;
  submitted_at: string | null;
  score: number | null;
  score_max: number | null;
  send_level_up: boolean | null;
};

const TRACKER_COLUMNS =
  'assignment_id, release_id, student_id, full_name, roll_no, level_id, has_login, status, seen_at, last_reminded_at, reminders, due_on, submission_id, submitted_at, score, score_max, send_level_up';

function toTrackerRow(row: TrackerDbRow): TrackerRow {
  return {
    assignmentId: row.assignment_id,
    releaseId: row.release_id,
    studentId: row.student_id,
    fullName: row.full_name,
    rollNo: row.roll_no,
    levelId: row.level_id,
    hasLogin: row.has_login,
    status: row.status,
    seenAt: row.seen_at,
    lastRemindedAt: row.last_reminded_at,
    reminders: row.reminders,
    dueOn: row.due_on,
    submissionId: row.submission_id,
    submittedAt: row.submitted_at,
    score: row.score,
    scoreMax: row.score_max,
    sendLevelUp: row.send_level_up ?? false,
  };
}

/** True when the due date has passed and the student has not sent it yet. */
export function isOverdue(row: Pick<TrackerRow, 'dueOn' | 'status'>, today = todayLocal()): boolean {
  return row.dueOn < today && OPEN_STATUSES.includes(row.status);
}

/** One release: who released it, when, the due date and the notes. */
export type Release = {
  id: number;
  notes: string | null;
  dueOn: string;
  releasedBy: string | null;
  releasedByName: string | null;
  releasedAt: string;
};

type ReleaseRow = { id: number; notes: string | null; due_on: string; released_by: string | null; released_at: string };

/** One assessment for staff: the assessment, its releases, and the tracker. */
export type StaffAssessment = {
  assessment: Assessment;
  authorName: string | null;
  releases: Release[];
  tracker: TrackerRow[];
};

/** Loads one assessment for staff; 'not_found' when it is not there or not visible; null offline. */
export async function fetchStaffAssessment(id: number): Promise<StaffAssessment | 'not_found' | null> {
  const [one, releases, tracker, names] = await Promise.all([
    supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('assessment_releases').select('id, notes, due_on, released_by, released_at').eq('assessment_id', id).order('released_at'),
    supabase.from('assessment_tracker').select(TRACKER_COLUMNS).eq('assessment_id', id).order('full_name'),
    fetchStaffNames(),
  ]);
  if (one.error || releases.error || tracker.error) return null;
  if (!one.data) return 'not_found';
  const assessment = toAssessment(one.data as AssessmentRow);
  return {
    assessment,
    authorName: assessment.createdBy ? (names.get(assessment.createdBy) ?? null) : null,
    releases: (releases.data as ReleaseRow[]).map((r) => ({
      id: r.id,
      notes: r.notes,
      dueOn: r.due_on,
      releasedBy: r.released_by,
      releasedByName: r.released_by ? (names.get(r.released_by) ?? null) : null,
      releasedAt: r.released_at,
    })),
    tracker: (tracker.data as TrackerDbRow[]).map(toTrackerRow),
  };
}

// ---------------------------------------------------------------- G6: the Guru's form

/** One rubric line as typed: the top score is text until checked. */
export type RubricField = { key: string; criterion: string; max: string };

/** The G6 form. */
export type AssessmentForm = {
  title: string;
  instructions: string;
  kind: AssessmentKind;
  levelId: number | null;
  levelUp: boolean;
  rubric: RubricField[];
  /** Files already saved on the assessment that stay (editing only). */
  kept: MediaFile[];
  /** Files picked on this device, uploaded on save. */
  files: PickedMedia[];
  link: string;
};

/** A new form starts with a rubric the Guru can change (the lines are suggestions). */
export function emptyAssessmentForm(defaultLines: string[]): AssessmentForm {
  return {
    title: '',
    instructions: '',
    kind: 'playing',
    levelId: null,
    levelUp: false,
    rubric: defaultLines.map((criterion, i) => ({ key: `line-${i}`, criterion, max: '5' })),
    kept: [],
    files: [],
    link: '',
  };
}

/** The form filled from a saved assessment, for editing (G6 edit, slice 2). */
export function formFromAssessment(a: Assessment): AssessmentForm {
  return {
    title: a.title,
    instructions: a.instructions,
    kind: a.kind,
    levelId: a.levelId,
    levelUp: a.levelUp,
    rubric: a.rubric.map((line, i) => ({ key: `line-${i}`, criterion: line.criterion, max: String(line.max) })),
    kept: a.media,
    files: [],
    link: a.mediaLink ?? '',
  };
}

export type AssessmentFormErrors = Partial<Record<'title' | 'instructions' | 'level' | 'rubric' | 'files' | 'link', MessageKey>>;

/** Whether a link looks like one the database takes: https, no spaces, at most 500 characters. */
export function isLinkOk(link: string): boolean {
  const value = link.trim();
  return value === '' || (value.length <= 500 && /^https:\/\/\S+$/.test(value));
}

/** The same checks as the database, so most mistakes show at once next to their field. */
export function checkAssessmentForm(form: AssessmentForm): AssessmentFormErrors {
  const errors: AssessmentFormErrors = {};
  const title = form.title.trim();
  if (!title) errors.title = 'assessments.errors.title_required';
  else if (title.length > TITLE_MAX) errors.title = 'assessments.errors.title_too_long';
  if (form.instructions.trim().length > INSTRUCTIONS_MAX) errors.instructions = 'assessments.errors.instructions_too_long';
  if (form.levelId === null) errors.level = 'assessments.compose.levelRequired';
  const lines = form.rubric.filter((line) => line.criterion.trim() !== '' || line.max.trim() !== '');
  if (lines.length === 0) errors.rubric = 'assessments.errors.rubric_required';
  else if (
    lines.length > RUBRIC_MAX_LINES ||
    lines.some((line) => {
      const max = Number(line.max.trim());
      return !line.criterion.trim() || line.criterion.trim().length > CRITERION_MAX
        || !Number.isInteger(max) || max < 1 || max > SCORE_TOP_MAX;
    })
  ) {
    errors.rubric = 'assessments.errors.rubric_invalid';
  }
  if (form.kept.length + form.files.length > MAX_MEDIA) errors.files = 'assessments.errors.too_many_media';
  if (!isLinkOk(form.link)) errors.link = 'assessments.errors.link_invalid';
  return errors;
}

/**
 * Uploads the files and saves the assessment, as a draft or sent at once. Returns its id, or a
 * message (the uploaded files are removed again when the save fails).
 */
export async function createAssessment(form: AssessmentForm, myId: string, send: boolean): Promise<{ id?: number; errorKey?: MessageKey }> {
  const uploaded = await uploadMedia(myId, form.files);
  if (!uploaded.media) return { errorKey: uploaded.errorKey };
  const rubric = rubricOf(form);
  try {
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        kind: form.kind,
        level_id: form.levelId,
        level_up: form.levelUp,
        rubric,
        media: uploaded.media,
        media_link: form.link.trim() || null,
        sent_at: send ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (error || !data) {
      await removeMedia(uploaded.media.map((m) => m.path));
      return { errorKey: errorKeyOf(error?.message) };
    }
    return { id: (data as { id: number }).id };
  } catch (failure) {
    await removeMedia(uploaded.media.map((m) => m.path));
    return { errorKey: errorKeyOf(String(failure)) };
  }
}

/** The rubric lines as the database takes them (empty lines left out). */
function rubricOf(form: AssessmentForm): RubricLine[] {
  return form.rubric
    .filter((line) => line.criterion.trim() !== '')
    .map((line) => ({ criterion: line.criterion.trim(), max: Number(line.max.trim()) }));
}

/**
 * G6 edit (Praveen, 3 Oct 2026): the title, instructions, files and link can change at any time;
 * the type, level, level-up flag and rubric only until the first release (`locked` = released;
 * the database refuses them after it, so scores keep their meaning). New files are uploaded first
 * and removed again when the save fails; files taken off the assessment are deleted after it.
 */
export async function updateAssessment(
  original: Assessment,
  form: AssessmentForm,
  myId: string,
  locked: boolean,
): Promise<MessageKey | undefined> {
  const uploaded = await uploadMedia(myId, form.files);
  if (!uploaded.media) return uploaded.errorKey;
  const change: Record<string, unknown> = {
    title: form.title.trim(),
    instructions: form.instructions.trim(),
    media: [...form.kept, ...uploaded.media],
    media_link: form.link.trim() || null,
  };
  if (!locked) {
    change.kind = form.kind;
    change.level_id = form.levelId;
    change.level_up = form.levelUp;
    change.rubric = rubricOf(form);
  }
  try {
    const { data, error } = await supabase.from('assessments').update(change).eq('id', original.id).select('id');
    if (error || !data || data.length === 0) {
      await removeMedia(uploaded.media.map((m) => m.path));
      return error ? errorKeyOf(error.message) : 'assessments.errors.not_allowed';
    }
  } catch (failure) {
    await removeMedia(uploaded.media.map((m) => m.path));
    return errorKeyOf(String(failure));
  }
  const keptPaths = new Set(form.kept.map((m) => m.path));
  await removeMedia(original.media.filter((m) => !keptPaths.has(m.path)).map((m) => m.path));
  return undefined;
}

/** The Guru sends a draft to the coordinators. */
export async function sendAssessment(id: number): Promise<MessageKey | undefined> {
  const { data, error } = await supabase
    .from('assessments')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
    .is('sent_at', null)
    .select('id');
  if (error) return errorKeyOf(error.message);
  return data && data.length > 0 ? undefined : 'assessments.errors.not_allowed';
}

/** The Guru deletes an assessment that was never released, and its files. */
export async function deleteAssessment(assessment: Assessment): Promise<MessageKey | undefined> {
  const { data, error } = await supabase.from('assessments').delete().eq('id', assessment.id).select('id');
  if (error) return /foreign key/i.test(error.message) ? 'assessments.errors.assessment_released' : errorKeyOf(error.message);
  if (!data || data.length === 0) return 'assessments.errors.not_allowed';
  await removeMedia(assessment.media.map((m) => m.path));
  return undefined;
}

// ---------------------------------------------------------------- C12: release

/** A student who can be picked for a release. */
export type ReleaseCandidate = StudentSummary & { hasLogin: boolean; alreadyHas: boolean };

/** What the release screen needs: the assessment and the students to pick from. */
export type ReleaseOptions = { assessment: Assessment; students: ReleaseCandidate[] };

/** Loads the release screen; 'not_found' when the assessment is not visible (or a draft). */
export async function fetchReleaseOptions(id: number): Promise<ReleaseOptions | 'not_found' | null> {
  const [one, students, logins, assigned] = await Promise.all([
    supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', id).maybeSingle(),
    fetchStudentSummaries(),
    supabase.from('students').select('id, profile_id'),
    supabase.from('assessment_assignments').select('student_id').eq('assessment_id', id),
  ]);
  if (one.error || !students || logins.error || assigned.error) return null;
  if (!one.data || !(one.data as AssessmentRow).sent_at) return 'not_found';
  const withLogin = new Set((logins.data as { id: string; profile_id: string | null }[]).filter((s) => s.profile_id).map((s) => s.id));
  const already = new Set((assigned.data as { student_id: string }[]).map((a) => a.student_id));
  return {
    assessment: toAssessment(one.data as AssessmentRow),
    students: students
      .filter((s) => s.status !== 'left')
      .map((s) => ({ ...s, hasLogin: withLogin.has(s.id), alreadyHas: already.has(s.id) })),
  };
}

/** What release_assessment answered. */
export type ReleaseResult = { assigned: number; already: number; noLogin: number };

export type ReleaseFormErrors = Partial<Record<'students' | 'due' | 'notes', MessageKey>>;

/** Checks the release form; `due` is typed day-month-year. */
export function checkReleaseForm(studentIds: string[], due: string, notes: string): ReleaseFormErrors {
  const errors: ReleaseFormErrors = {};
  if (studentIds.length === 0) errors.students = 'assessments.errors.students_required';
  const dueOn = parseDayMonthYear(due);
  if (!due.trim()) errors.due = 'assessments.errors.due_required';
  else if (!dueOn) errors.due = 'assessments.release.dueInvalid';
  else if (dueOn < todayLocal()) errors.due = 'assessments.errors.due_past';
  if (notes.trim().length > NOTES_MAX) errors.notes = 'assessments.errors.notes_too_long';
  return errors;
}

/** C12: release to the picked students. */
export async function releaseAssessment(
  id: number,
  studentIds: string[],
  due: string,
  notes: string,
): Promise<{ result?: ReleaseResult; errorKey?: MessageKey }> {
  const dueOn = parseDayMonthYear(due);
  const { data, error } = await supabase.rpc('release_assessment', {
    p_assessment: id,
    p_students: studentIds,
    p_due_on: dueOn,
    p_notes: notes.trim() || null,
  });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const r = data as { assigned: number; already: number; no_login: number };
  return { result: { assigned: r.assigned, already: r.already, noLogin: r.no_login } };
}

/** A due date for the form: today plus `days`, written day-month-year. */
export function dueInDays(days: number): string {
  const [y, m, d] = todayLocal().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return formatTypedDate(date.toISOString().slice(0, 10));
}

// ---------------------------------------------------------------- C13: remind

/** What remind_assessment answered. */
export type RemindResult = { reminded: number; noLogin: number; skipped: number };

/** C13: reminds the given students (those who have sent it are skipped by the database). */
export async function remindStudents(assignmentIds: number[]): Promise<{ result?: RemindResult; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('remind_assessment', { p_assignments: assignmentIds });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const r = data as { reminded: number; no_login: number; skipped: number };
  return { result: { reminded: r.reminded, noLogin: r.no_login, skipped: r.skipped } };
}

// ---------------------------------------------------------------- submissions (S7, C14)

/** One recording a student sent, with its review once there is one. */
export type Submission = {
  id: number;
  file: MediaFile | null;
  link: string | null;
  note: string | null;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  outcome: 'accepted' | 'redo' | null;
  scores: number[];
  score: number | null;
  scoreMax: number | null;
  comment: string | null;
  sendLevelUp: boolean;
  /** When the file was deleted from Storage (30 days after the review). */
  fileRemovedAt: string | null;
  /** The reviewer's spoken comment (C14, slice 4; deleted with the recording). */
  voiceNote: MediaFile | null;
};

type SubmissionRow = {
  id: number;
  file: unknown;
  link: string | null;
  note: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  outcome: 'accepted' | 'redo' | null;
  scores: unknown;
  score: number | null;
  score_max: number | null;
  comment: string | null;
  send_level_up: boolean;
  file_removed_at: string | null;
  voice_note: unknown;
};

const SUBMISSION_COLUMNS =
  'id, file, link, note, submitted_at, reviewed_by, reviewed_at, outcome, scores, score, score_max, comment, send_level_up, file_removed_at, voice_note';

function toSubmission(row: SubmissionRow, names: Map<string, string>): Submission {
  return {
    id: row.id,
    file: parseMediaFile(row.file),
    link: row.link,
    note: row.note,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by ? (names.get(row.reviewed_by) ?? null) : null,
    reviewedAt: row.reviewed_at,
    outcome: row.outcome,
    scores: Array.isArray(row.scores) ? row.scores.filter((n): n is number => typeof n === 'number') : [],
    score: row.score,
    scoreMax: row.score_max,
    comment: row.comment,
    sendLevelUp: row.send_level_up,
    fileRemovedAt: row.file_removed_at,
    voiceNote: parseMediaFile(row.voice_note),
  };
}

/** One student's assessment with everything around it (S7 for the student, C14 for staff). */
export type AssignmentDetail = {
  assignmentId: number;
  status: AssignmentStatus;
  seenAt: string | null;
  assessment: Assessment;
  release: Release;
  /** Newest first. */
  submissions: Submission[];
  /** Staff only: the tracker row (name, roll number). */
  student: TrackerRow | null;
};

type AssignmentRow = { id: number; status: AssignmentStatus; seen_at: string | null; assessment_id: number; release_id: number };

/** Loads one assignment by id; 'not_found' when it is not there or not visible; null offline. */
export async function fetchAssignment(assignmentId: number, asStaff: boolean): Promise<AssignmentDetail | 'not_found' | null> {
  const asg = await supabase
    .from('assessment_assignments')
    .select('id, status, seen_at, assessment_id, release_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (asg.error) return null;
  if (!asg.data) return 'not_found';
  const row = asg.data as AssignmentRow;
  const [one, release, subs, names, tracker] = await Promise.all([
    supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', row.assessment_id).maybeSingle(),
    supabase.from('assessment_releases').select('id, notes, due_on, released_by, released_at').eq('id', row.release_id).maybeSingle(),
    supabase.from('assessment_submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false }),
    fetchStaffNames(),
    asStaff
      ? supabase.from('assessment_tracker').select(TRACKER_COLUMNS).eq('assignment_id', assignmentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (one.error || release.error || subs.error || tracker.error) return null;
  if (!one.data || !release.data) return 'not_found';
  const r = release.data as ReleaseRow;
  return {
    assignmentId: row.id,
    status: row.status,
    seenAt: row.seen_at,
    assessment: toAssessment(one.data as AssessmentRow),
    release: {
      id: r.id,
      notes: r.notes,
      dueOn: r.due_on,
      releasedBy: r.released_by,
      releasedByName: r.released_by ? (names.get(r.released_by) ?? null) : null,
      releasedAt: r.released_at,
    },
    submissions: (subs.data as SubmissionRow[]).map((s) => toSubmission(s, names)),
    student: tracker.data ? toTrackerRow(tracker.data as TrackerDbRow) : null,
  };
}

/** S7: tells the coordinator the student opened it. True when saved. */
export async function markAssessmentSeen(assignmentId: number): Promise<boolean> {
  const { error } = await supabase.rpc('mark_assessment_seen', { p_assignment: assignmentId });
  return !error;
}

export type SubmitFormErrors = Partial<Record<'recording' | 'link' | 'note', MessageKey>>;

/** Checks the S7 form: a file or a link, a proper link, a short note. */
export function checkSubmitForm(file: PickedMedia | null, link: string, note: string): SubmitFormErrors {
  const errors: SubmitFormErrors = {};
  if (!file && !link.trim()) errors.recording = 'assessments.errors.recording_required';
  if (!isLinkOk(link)) errors.link = 'assessments.errors.link_invalid';
  if (note.trim().length > NOTE_MAX) errors.note = 'assessments.errors.note_too_long';
  return errors;
}

/** S7: uploads the recording (if any) and sends it. The file is removed again if sending fails. */
export async function submitRecording(
  assignmentId: number,
  myId: string,
  file: PickedMedia | null,
  link: string,
  note: string,
): Promise<MessageKey | undefined> {
  let saved: MediaFile | null = null;
  if (file) {
    const uploaded = await uploadMedia(myId, [file]);
    if (!uploaded.media) return uploaded.errorKey;
    saved = uploaded.media[0];
  }
  const { error } = await supabase.rpc('submit_assessment', {
    p_assignment: assignmentId,
    p_file: saved,
    p_link: link.trim() || null,
    p_note: note.trim() || null,
  });
  if (error) {
    if (saved) await removeMedia([saved.path]);
    return errorKeyOf(error.message);
  }
  return undefined;
}

/** C14: the review form as typed. */
export type ReviewForm = {
  scores: (number | null)[];
  comment: string;
  outcome: 'accepted' | 'redo' | null;
  sendLevelUp: boolean;
  /** A voice note recorded in the app, uploaded when the review is saved (slice 4). */
  voiceNote: PickedMedia | null;
};

export type ReviewFormErrors = Partial<Record<'scores' | 'comment' | 'outcome', MessageKey>>;

/**
 * C14: checks a review before it is saved: a score from 0 to the line's top for every rubric line, an
 * outcome, and for a redo a comment or a voice note (#52). Returns a message key per field in error.
 */
export function checkReviewForm(form: ReviewForm, rubric: RubricLine[]): ReviewFormErrors {
  const errors: ReviewFormErrors = {};
  if (form.scores.length !== rubric.length || form.scores.some((s, i) => s === null || s < 0 || s > rubric[i].max)) {
    errors.scores = 'assessments.review.scoresMissing';
  }
  if (!form.outcome) errors.outcome = 'assessments.errors.outcome_required';
  if (form.outcome === 'redo' && !form.comment.trim() && !form.voiceNote) errors.comment = 'assessments.errors.comment_required';
  if (form.comment.trim().length > COMMENT_MAX) errors.comment = 'assessments.errors.comment_too_long';
  return errors;
}

/** C14: uploads the voice note (if any) and saves the review; the note is removed again if that fails. */
export async function reviewSubmission(submissionId: number, myId: string, form: ReviewForm): Promise<MessageKey | undefined> {
  let voice: MediaFile | null = null;
  if (form.voiceNote) {
    const uploaded = await uploadMedia(myId, [form.voiceNote]);
    if (!uploaded.media) return uploaded.errorKey;
    voice = uploaded.media[0];
  }
  const { error } = await supabase.rpc('review_submission', {
    p_submission: submissionId,
    p_scores: form.scores,
    p_comment: form.comment.trim() || null,
    p_outcome: form.outcome,
    p_send_level_up: form.sendLevelUp,
    p_voice_note: voice,
  });
  if (error) {
    if (voice) await removeMedia([voice.path]);
    return errorKeyOf(error.message);
  }
  return undefined;
}

// ---------------------------------------------------------------- S7: the student's list

/** One assessment on the student's list. */
export type MyAssessmentItem = {
  assignmentId: number;
  status: AssignmentStatus;
  title: string;
  kind: AssessmentKind;
  levelUp: boolean;
  dueOn: string;
};

/** The signed-in student's assessments, those still to do first, then by due date. */
export async function fetchMyAssessments(): Promise<MyAssessmentItem[] | null> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, status, assessments(title, kind, level_up), assessment_releases(due_on)')
    .order('id', { ascending: false });
  if (error) return null;
  type Row = {
    id: number;
    status: AssignmentStatus;
    assessments: { title: string; kind: AssessmentKind; level_up: boolean } | null;
    assessment_releases: { due_on: string } | null;
  };
  const items = (data as unknown as Row[]).flatMap((row) =>
    row.assessments && row.assessment_releases
      ? [{
          assignmentId: row.id,
          status: row.status,
          title: row.assessments.title,
          kind: row.assessments.kind,
          levelUp: row.assessments.level_up,
          dueOn: row.assessment_releases.due_on,
        }]
      : [],
  );
  const open = (s: AssignmentStatus) => (OPEN_STATUSES.includes(s) ? 0 : 1);
  return items.sort((a, b) => open(a.status) - open(b.status) || a.dueOn.localeCompare(b.dueOn));
}
