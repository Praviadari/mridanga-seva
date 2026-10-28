// Rhythm Playground data (docs/RHYTHM_PLAYGROUND.md §9; docs/DECISIONS.md #720-#729; migration 0065). The pack of
// published content (cached on the phone, refreshed when its version changes), one student's state, rounds saved
// through the offline queue (idempotent by the round's id), the staff reads, approval and publishing, signed links
// for recorded sounds, and the name a dropped challenge is reported under (lib/playground/drop-report.ts sends it).
//
// Row-level security: content is read through playground_pack (approved, published, non-placeholder unless TEST
// allows placeholders); a student reads their own state and rounds; rounds are written only by record_round, which
// re-marks every recognition answer. Staff write drafts directly (play_bols, play_exercises, ... — W3's screens);
// the Guru approves (play_set_status) and publishes (publish_playground).

import { labelRules } from '@/lib/playground/labels';
import { cachedPack, savePack } from '@/lib/playground/pack-cache';
import { enqueueRound, rememberRounds, syncRounds, type SendOutcome, type SyncReport } from '@/lib/playground/round-queue';
import {
  DEFAULT_PLAY_SETTINGS,
  type AssetKind,
  type ContentStatus,
  type DroppedChallenge,
  type ExerciseAnswer,
  type GameId,
  type PlayAsset,
  type PlayAssignment,
  type PlayBol,
  type PlayedRound,
  type PlayExercise,
  type PlayPack,
  type PlaySettings,
  type PlayTemplate,
  type RoundItem,
  type SkillId,
  type StudentPlayState,
} from '@/lib/playground/types';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, isNetworkError, type MessageKey } from './errors';

/** The private bucket of recorded Playground sounds (0065). */
export const PLAYGROUND_BUCKET = 'playground-audio';
/** Signed links for content last an hour (§13.3) and are never stored. */
export const AUDIO_LINK_SECONDS = 3600;

// ---------------------------------------------------------------- server rows → app types

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function parseBol(r: Json): PlayBol {
  return {
    id: String(r.id),
    written: String(r.written ?? r.id),
    head: (r.head as PlayBol['head']) ?? 'dayan',
    technique: str(r.technique),
    open: typeof r.open === 'boolean' ? r.open : null,
    levelId: num(r.level_id) ?? 1,
    soundsLike: arr<string>(r.sounds_like),
    closePairs: arr<string>(r.close_pairs),
    assetId: num(r.asset_id),
    placeholder: r.placeholder === true,
  };
}

export function parseAsset(r: Json): PlayAsset {
  return {
    id: num(r.id) ?? 0,
    kind: r.kind as AssetKind,
    path: str(r.path),
    bundledKey: str(r.bundled_key),
    mime: (str(r.mime) as PlayAsset['mime']) ?? null,
    durationMs: num(r.duration_ms),
    bpm: num(r.bpm),
    beatGrid: r.beat_grid && typeof r.beat_grid === 'object' ? (r.beat_grid as Record<string, unknown>) : null,
    instruments: arr<string>(r.instruments),
    licence: (r.licence as PlayAsset['licence']) ?? 'own',
    performer: str(r.performer),
    credit: str(r.credit),
    placeholder: r.placeholder === true,
  };
}

export function parseTemplate(r: Json): PlayTemplate {
  return {
    id: num(r.id) ?? 0,
    game: r.game as GameId,
    skill: r.skill as SkillId,
    responseMode: r.response_mode as PlayTemplate['responseMode'],
    levelMin: num(r.level_min) ?? 1,
    levelMax: num(r.level_max) ?? 1,
    steps: arr<PlayTemplate['steps'][number]>(r.steps),
    params: r.params && typeof r.params === 'object' ? (r.params as PlayTemplate['params']) : {},
    revision: num(r.revision) ?? 1,
  };
}

export function parseExercise(r: Json): PlayExercise {
  return {
    id: num(r.id) ?? 0,
    game: r.game as GameId,
    templateId: num(r.template_id),
    levelId: num(r.level_id) ?? 1,
    skills: arr<SkillId>(r.skills),
    taalId: num(r.taal_id),
    sequence: Array.isArray(r.sequence) ? (r.sequence as string[]) : null,
    divisions: Array.isArray(r.divisions) ? (r.divisions as number[]) : null,
    answer: r.answer && typeof r.answer === 'object' ? (r.answer as ExerciseAnswer) : {},
    distractors: arr<string>(r.distractors),
    promptAssets: arr<unknown>(r.prompt_assets).map((v) => num(v) ?? 0),
    bpmMin: num(r.bpm_min),
    bpmMax: num(r.bpm_max),
    guna: arr<unknown>(r.guna).map((v) => num(v) ?? 1),
    requiresItem: num(r.requires_item),
    locale: str(r.locale) ?? 'en',
    attribution: str(r.attribution),
    placeholder: r.placeholder === true,
    revision: num(r.revision) ?? 1,
  };
}

/** playground_pack's answer → the app's pack. */
export function parsePack(r: Json): PlayPack {
  return {
    version: num(r.version) ?? 0,
    publishedAt: String(r.published_at ?? ''),
    placeholders: r.placeholders === true,
    bols: arr<Json>(r.bols).map(parseBol),
    assets: arr<Json>(r.assets).map(parseAsset),
    templates: arr<Json>(r.templates).map(parseTemplate),
    exercises: arr<Json>(r.exercises).map(parseExercise),
    labels: labelRules(r.labels),
  };
}

/** A saved round (play_rounds as jsonb) → the app's round. */
export function parseRound(r: Json): PlayedRound {
  const t = r.timing && typeof r.timing === 'object' ? (r.timing as Json) : null;
  return {
    id: String(r.id),
    game: r.game as GameId,
    skill: r.skill as SkillId,
    mode: (r.mode as PlayedRound['mode']) ?? 'play',
    levelId: num(r.level_id),
    step: num(r.step) ?? 1,
    seed: num(r.seed) ?? 0,
    contentVersion: num(r.content_version) ?? 0,
    startedAt: String(r.started_at),
    finishedAt: str(r.finished_at),
    items: arr<RoundItem>(r.items),
    timing: t
      ? {
          medianMs: num(t.median_ms) ?? 0,
          spreadMs: num(t.spread_ms) ?? 0,
          calibrated: t.calibrated === true,
          ...(num(t.offset_ms) !== null ? { offsetMs: num(t.offset_ms) as number } : {}),
        }
      : null,
    device: (str(r.device) as PlayedRound['device']) ?? null,
  };
}

/** The app's round → record_round's argument. */
export function roundPayload(round: PlayedRound): Json {
  return {
    id: round.id,
    game: round.game,
    skill: round.skill,
    mode: round.mode,
    step: round.step,
    seed: round.seed,
    content_version: round.contentVersion,
    started_at: round.startedAt,
    finished_at: round.finishedAt,
    items: round.items,
    device: round.device,
    ...(round.timing
      ? {
          timing: {
            median_ms: round.timing.medianMs,
            spread_ms: round.timing.spreadMs,
            calibrated: round.timing.calibrated,
            ...(round.timing.offsetMs !== undefined ? { offset_ms: round.timing.offsetMs } : {}),
          },
        }
      : {}),
  };
}

function parseSettings(r: unknown): PlaySettings {
  if (!r || typeof r !== 'object') return DEFAULT_PLAY_SETTINGS;
  const s = r as Json;
  return {
    surprise: s.surprise !== false,
    relaxedTiming: s.relaxed_timing === true,
    levelUpOk: s.level_up_ok === true,
    steps: s.steps && typeof s.steps === 'object' ? (s.steps as PlaySettings['steps']) : {},
  };
}

function parseAssignment(r: Json): PlayAssignment {
  return {
    id: num(r.id) ?? 0,
    game: r.game as GameId,
    skill: (str(r.skill) as SkillId | null) ?? null,
    levelId: num(r.level_id),
    groupId: num(r.group_id),
    studentId: str(r.student_id),
    stepMin: num(r.step_min),
    stepMax: num(r.step_max),
    fromDay: String(r.from_day ?? ''),
    dueDay: str(r.due_day),
    note: str(r.note),
  };
}

/** my_playground_state / staff_playground_progress → the app's state. */
export function parseState(r: Json): StudentPlayState {
  return {
    studentId: String(r.student_id),
    levelId: num(r.level_id) ?? 1,
    ticked: arr<unknown>(r.ticked).map((v) => num(v) ?? 0),
    groups: arr<unknown>(r.groups).map((v) => num(v) ?? 0),
    settings: parseSettings(r.settings),
    assignments: arr<Json>(r.assignments).map(parseAssignment),
    rounds: arr<Json>(r.rounds).map(parseRound),
  };
}

// ---------------------------------------------------------------- errors

const ERRORS: Record<string, MessageKey> = {
  not_allowed: 'playEngine.errors.notAllowed',
  approval_guru_only: 'playEngine.errors.approvalGuruOnly',
  placeholders_not_allowed: 'playEngine.errors.placeholdersNotAllowed',
  exercise_bol_not_approved: 'playEngine.errors.bolNotApproved',
  exercise_asset_not_approved: 'playEngine.errors.assetNotApproved',
  asset_file_missing: 'playEngine.errors.assetFileMissing',
  asset_licence_incomplete: 'playEngine.errors.assetLicence',
  bol_invalid: 'playEngine.errors.contentInvalid',
  asset_invalid: 'playEngine.errors.contentInvalid',
  template_invalid: 'playEngine.errors.contentInvalid',
  exercise_invalid: 'playEngine.errors.contentInvalid',
  exercise_template_invalid: 'playEngine.errors.contentInvalid',
  content_not_found: 'playEngine.errors.contentNotFound',
  round_limit: 'playEngine.errors.roundLimit',
};

/** The message for a Playground error. */
export function playgroundErrorKey(message: string): MessageKey {
  return ERRORS[message] ?? fallbackErrorKey(message);
}

// ---------------------------------------------------------------- the pack

export type PackLoad = { pack: PlayPack | null; fromCache: boolean; errorKey: MessageKey | null };

/**
 * The pack: the phone's copy at once if the server is unreachable; a new version replaces it when there is one.
 * `pack` is null only when no pack was ever downloaded and none can be now (nothing published yet, or offline).
 */
export async function loadPlaygroundPack(): Promise<PackLoad> {
  const cached = cachedPack();
  const { data, error } = await supabase.rpc('playground_pack', { p_have_version: cached?.version ?? 0 });
  if (error) {
    return { pack: cached, fromCache: true, errorKey: cached && isNetworkError(error.message) ? null : playgroundErrorKey(error.message) };
  }
  if (!data) return { pack: cached, fromCache: true, errorKey: null };
  const pack = parsePack(data as Json);
  savePack(pack);
  return { pack, fromCache: false, errorKey: null };
}

// ---------------------------------------------------------------- the student's state and rounds

/** The signed-in student's state; its rounds are also remembered on the phone for the repeat guard. */
export async function fetchMyPlayState(profileId: string): Promise<{ state: StudentPlayState | null; errorKey: MessageKey | null }> {
  const { data, error } = await supabase.rpc('my_playground_state');
  if (error || !data) return { state: null, errorKey: error ? playgroundErrorKey(error.message) : 'common.genericError' };
  const state = parseState(data as Json);
  rememberRounds(profileId, state.rounds);
  return { state, errorKey: null };
}

/** Sends one round: saved (or saved before), refused (never sent again), or offline (stays in the queue). */
export async function sendRound(round: PlayedRound): Promise<SendOutcome> {
  const { error } = await supabase.rpc('record_round', { p_round: roundPayload(round) });
  if (!error) return 'saved';
  return isNetworkError(error.message) ? 'offline' : 'refused';
}

/** Keeps a finished (or left) round on the phone and sends the waiting ones. Never throws. */
export async function saveRound(profileId: string, round: PlayedRound): Promise<SyncReport> {
  enqueueRound(profileId, round);
  return syncPlayground(profileId);
}

/** Sends this login's waiting rounds (on opening the Playground, and when the app is back online). */
export function syncPlayground(profileId: string): Promise<SyncReport> {
  return syncRounds(profileId, async (round) => {
    try {
      return await sendRound(round);
    } catch {
      return 'offline';
    }
  });
}

/** The student switches Surprise me on or off. */
export async function setMySurprise(on: boolean): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('play_set_surprise', { p_on: on });
  return error ? playgroundErrorKey(error.message) : null;
}

// ---------------------------------------------------------------- staff

/** A facilitator's rating (play_ratings), as staff_playground_progress lists it. */
export type PlayRating = { id: number; skill: SkillId; rating: number; note: string | null; submissionId: number | null; ratedAt: string; ratedByName: string | null };

/** A weekly summary of folded rounds (play_skill_weeks). */
export type PlaySkillWeek = { week: string; skill: SkillId; opportunities: number; correct: number | null; timingMedianMs: number | null; timingSpreadMs: number | null; rounds: number };

export type StaffStudentPlay = StudentPlayState & { weeks: PlaySkillWeek[]; ratings: PlayRating[] };

/** Staff: one student's Playground. */
export async function fetchStudentPlayground(studentId: string): Promise<{ data: StaffStudentPlay | null; errorKey: MessageKey | null }> {
  const { data, error } = await supabase.rpc('staff_playground_progress', { p_student: studentId });
  if (error || !data) return { data: null, errorKey: error ? playgroundErrorKey(error.message) : 'common.genericError' };
  const r = data as Json;
  return {
    data: {
      ...parseState(r),
      weeks: arr<Json>(r.weeks).map((w) => ({
        week: String(w.week), skill: w.skill as SkillId, opportunities: num(w.opportunities) ?? 0, correct: num(w.correct),
        timingMedianMs: num(w.timing_median_ms), timingSpreadMs: num(w.timing_spread_ms), rounds: num(w.rounds) ?? 0,
      })),
      ratings: arr<Json>(r.ratings).map((x) => ({
        id: num(x.id) ?? 0, skill: x.skill as SkillId, rating: num(x.rating) ?? 0, note: str(x.note), submissionId: num(x.submission_id),
        ratedAt: String(x.rated_at), ratedByName: str(x.rated_by_name),
      })),
    },
    errorKey: null,
  };
}

export type ClassPlayStudent = { studentId: string; fullName: string; levelId: number; rounds: PlayedRound[] };

/** Staff: a level's or a group's students with their rounds of 30 days (labels: lib/playground/labels.ts). */
export async function fetchClassPlayground(filter: { levelId?: number; groupId?: number }): Promise<{ data: ClassPlayStudent[] | null; errorKey: MessageKey | null }> {
  const { data, error } = await supabase.rpc('staff_playground_class', { p_level: filter.levelId ?? null, p_group: filter.groupId ?? null });
  if (error) return { data: null, errorKey: playgroundErrorKey(error.message) };
  return {
    data: arr<Json>(data).map((s) => ({
      studentId: String(s.student_id), fullName: String(s.full_name ?? ''), levelId: num(s.level_id) ?? 1, rounds: arr<Json>(s.rounds).map(parseRound),
    })),
    errorKey: null,
  };
}

export type ContentKind = 'bol' | 'asset' | 'template' | 'exercise';

/** Staff send content for review (or back to draft); the Guru approves and retires. */
export async function setContentStatus(kind: ContentKind, id: string | number, status: ContentStatus): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('play_set_status', { p_kind: kind, p_id: String(id), p_status: status });
  return error ? playgroundErrorKey(error.message) : null;
}

/** The Guru publishes every approved row as a new version. */
export async function publishPlayground(note: string | null): Promise<{ version: number | null; errorKey: MessageKey | null }> {
  const { data, error } = await supabase.rpc('publish_playground', { p_note: note });
  if (error) return { version: null, errorKey: playgroundErrorKey(error.message) };
  return { version: num((data as Json | null)?.version), errorKey: null };
}

// ---------------------------------------------------------------- sounds and reports

/** Signed links (1 hour) for recorded sounds, by path; a path the reader may not open is left out. */
export async function playgroundAudioUrls(paths: readonly string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(PLAYGROUND_BUCKET).createSignedUrls([...paths], AUDIO_LINK_SECONDS);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
  return out;
}

/**
 * The error name of a dropped challenge: the check's reason, the exercise, the template and the content version —
 * never the student, the seed or the answer (§8.5, §13.3).
 */
export function dropErrorName(drop: DroppedChallenge, contentVersion: number): string {
  const reason = drop.reason.replace(/[^a-z_]/g, '');
  return `PlayCheck_${reason}_e${drop.exerciseId}_t${drop.templateId ?? 0}_v${contentVersion}`.slice(0, 60);
}
