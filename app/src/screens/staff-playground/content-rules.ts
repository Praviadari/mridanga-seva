// The rules of the facilitator's Playground screens, kept apart from the screens so they can be tested
// (docs/RHYTHM_PLAYGROUND.md §10, §8.4, §8.7, §12.2; docs/DECISIONS.md #740-#749): reading the forms (the bol
// notation of 0018 with dictionary ids, the same shapes 0065's triggers check), which status changes a login may
// offer, the approval queue, what the next publish changes, pool sizes per game and level, sample rounds for a
// preview (W1's generator on the content as it stands), and the order of Class progress (Ready for Review first,
// then longest without practice — never a ranking).

import type { AdminContent, AdminExercise, AdminTemplate, ContentMeta } from '@/data/playground-admin';
import { generateRound, topStep } from '@/lib/playground/generator';
import { DEFAULT_LABEL_RULES, skillProgress } from '@/lib/playground/labels';
import { isBeat, MAX_BEATS, plainBeat } from '@/lib/playground/notation';
import type {
  ContentStatus,
  GameId,
  GeneratedRound,
  LabelRules,
  PlayedRound,
  PlayPack,
  PlayTemplate,
  SkillId,
  SkillProgress,
} from '@/lib/playground/types';

// ---------------------------------------------------------------- reading the forms

/** Dictionary ids from a text: words split on spaces or commas, lower case. */
export function readIds(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/[\s,]+/)) if (word && !out.includes(word)) out.push(word);
  return out;
}

/** A dictionary id: 1-10 letters a-z (0065 play_bols.id). */
export const BOL_ID = /^[a-z]{1,10}$/;

/** Beats typed as the class writes them ('Te.Re khe tā -') in the tables' form, or the problem. */
export function readBeats(text: string): { beats: string[]; problem: 'empty' | 'tooLong' | 'notation' | null } {
  const beats = text.trim().split(/\s+/).filter(Boolean).map(plainBeat);
  if (beats.length === 0) return { beats, problem: 'empty' };
  if (beats.length > MAX_BEATS) return { beats, problem: 'tooLong' };
  return { beats, problem: beats.every(isBeat) ? null : 'notation' };
}

/** Beats per vibhag ('4 4'), adding up to the beats; empty = none. */
export function readDivisions(text: string, beats: number): { divisions: number[] | null; problem: boolean } {
  const parts = text.trim().split(/[\s+,]+/).filter(Boolean).map(Number);
  if (parts.length === 0) return { divisions: null, problem: false };
  const ok = parts.every((d) => Number.isInteger(d) && d >= 1) && parts.reduce((a, b) => a + b, 0) === beats;
  return { divisions: ok ? parts : null, problem: !ok };
}

/** Distractors, one per line, each in the notation (a bol id, or a phrase of beats). */
export function readDistractors(text: string): { distractors: string[]; problem: boolean } {
  const distractors: string[] = [];
  let problem = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const { beats, problem: p } = readBeats(line);
    if (p) problem = true;
    const key = beats.join(' ');
    if (!distractors.includes(key)) distractors.push(key);
  }
  return { distractors, problem: problem || distractors.length > 12 };
}

/** A tempo in beats a minute (30-240), empty = none. */
export function readBpm(text: string): { bpm: number | null; problem: boolean } {
  if (!text.trim()) return { bpm: null, problem: false };
  const bpm = Number(text.replace(',', '.'));
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? { bpm: Math.round(bpm * 10) / 10, problem: false } : { bpm: null, problem: true };
}

/** JSON typed into the template form: a list of steps or an object of parameters. */
export function readJson(text: string, want: 'array' | 'object'): unknown[] | Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (want === 'array') return Array.isArray(value) ? value : null;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Template steps as 0065 takes them: 1-20 objects, each with a whole "step" 1-20 once. */
export function stepsOk(steps: unknown[]): boolean {
  if (steps.length < 1 || steps.length > 20) return false;
  const seen = new Set<number>();
  for (const s of steps) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    const step = (s as { step?: unknown }).step;
    if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 20 || seen.has(step)) return false;
    seen.add(step);
  }
  return true;
}

// ---------------------------------------------------------------- the approval flow

/** A status change a screen offers. Coordinators: draft ↔ review. The head facilitator: also approve and retire. */
export type StatusAction = 'submit' | 'unsubmit' | 'approve' | 'sendBack' | 'retire' | 'restore';

export const ACTION_STATUS: Readonly<Record<StatusAction, ContentStatus>> = {
  submit: 'in_review',
  unsubmit: 'draft',
  approve: 'approved',
  sendBack: 'draft',
  retire: 'retired',
  restore: 'draft',
};

/** The changes a login may make to a row in this status (the triggers refuse the rest). */
export function statusActions(status: ContentStatus, headFacilitator: boolean): StatusAction[] {
  if (!headFacilitator) {
    if (status === 'draft') return ['submit'];
    if (status === 'in_review') return ['unsubmit'];
    return [];
  }
  if (status === 'draft') return ['approve', 'submit', 'retire'];
  if (status === 'in_review') return ['approve', 'sendBack', 'retire'];
  if (status === 'approved') return ['retire'];
  return ['restore'];
}

/** A draft never published may be deleted, by its author or the head facilitator (0065 draft_delete). */
export function canDelete(row: ContentMeta, headFacilitator: boolean, myId: string | null | undefined): boolean {
  return row.status === 'draft' && row.firstPublishedIn === null && (headFacilitator || (!!myId && row.createdBy === myId));
}

/** Retired rows are read-only for coordinators; the head facilitator restores them first. */
export function canEdit(row: ContentMeta | null, staff: boolean): boolean {
  return staff && (row === null || row.status !== 'retired');
}

export type ContentKind = 'bol' | 'asset' | 'template' | 'exercise';

/** One row of the approval queue or the publish list, whatever its table. */
export type QueueRow = { kind: ContentKind; id: string; revision: number; status: ContentStatus; updatedAt: string; placeholder: boolean; firstPublishedIn: number | null };

function rowsOf(content: AdminContent): QueueRow[] {
  const pick = (kind: ContentKind, id: string | number, r: ContentMeta): QueueRow => ({
    kind,
    id: String(id),
    revision: r.revision,
    status: r.status,
    updatedAt: r.updatedAt,
    placeholder: r.placeholder,
    firstPublishedIn: r.firstPublishedIn,
  });
  return [
    ...content.bols.map((r) => pick('bol', r.id, r)),
    ...content.assets.map((r) => pick('asset', r.id, r)),
    ...content.templates.map((r) => pick('template', r.id, r)),
    ...content.exercises.map((r) => pick('exercise', r.id, r)),
  ];
}

/** Everything waiting for the head facilitator, oldest first (bols first: exercises need them approved). */
export function approvalQueue(content: AdminContent): QueueRow[] {
  const order: Record<ContentKind, number> = { bol: 0, asset: 1, template: 2, exercise: 3 };
  return rowsOf(content)
    .filter((r) => r.status === 'in_review')
    .sort((a, b) => order[a.kind] - order[b.kind] || a.updatedAt.localeCompare(b.updatedAt));
}

/**
 * What the next publish changes: approved rows not in a version yet (new = never published, revised = a new
 * revision), and rows that left the pack since the last publish (retired or sent back to review after being
 * published) — phones keep those until the next version.
 */
export function nextPublish(content: AdminContent): { added: QueueRow[]; revised: QueueRow[]; leaving: QueueRow[] } {
  const rows = rowsOf(content);
  const pending = (kind: ContentKind, id: string) => {
    const list: readonly (ContentMeta & { id: string | number })[] =
      kind === 'bol' ? content.bols : kind === 'asset' ? content.assets : kind === 'template' ? content.templates : content.exercises;
    return list.find((r) => String(r.id) === id)?.publishedIn ?? null;
  };
  const since = content.latest?.publishedAt ?? '';
  const waiting = rows.filter((r) => r.status === 'approved' && pending(r.kind, r.id) === null);
  return {
    added: waiting.filter((r) => r.firstPublishedIn === null),
    revised: waiting.filter((r) => r.firstPublishedIn !== null),
    leaving: rows.filter((r) => r.status !== 'approved' && r.firstPublishedIn !== null && r.updatedAt > since),
  };
}

/** Approved placeholder rows: a publish on LIVE refuses them (§19.3). */
export function approvedPlaceholders(content: AdminContent): number {
  return rowsOf(content).filter((r) => r.status === 'approved' && r.placeholder).length;
}

// ---------------------------------------------------------------- pool sizes (§8.7, §10.1)

/** Fewer approved items than this for a game and level: rounds become "Review practice" (§8.7: max(6, 2 × 4..8)). */
export function enoughFor(roundLen: number): number {
  return Math.max(6, 2 * roundLen);
}

export type PoolSize = { game: GameId; levelId: number; approved: number; waiting: number };

/** Approved exercises (and ones waiting for approval) per game and level, in game then level order. */
export function poolSizes(exercises: readonly AdminExercise[]): PoolSize[] {
  const map = new Map<string, PoolSize>();
  for (const ex of exercises) {
    if (ex.status !== 'approved' && ex.status !== 'in_review') continue;
    const key = `${ex.game}|${ex.levelId}`;
    const size = map.get(key) ?? { game: ex.game, levelId: ex.levelId, approved: 0, waiting: 0 };
    if (ex.status === 'approved') size.approved += 1;
    else size.waiting += 1;
    map.set(key, size);
  }
  return [...map.values()].sort((a, b) => a.game.localeCompare(b.game) || a.levelId - b.levelId);
}

// ---------------------------------------------------------------- preview (§8.4 DYN-06, §10.1 "Preview generated variants")

/** The seeds of the preview's sample rounds: always the same five, so two facilitators see the same. */
export const PREVIEW_SEEDS: readonly number[] = [101, 202, 303, 404, 505];

/** The template an exercise is played with: its own, else the game's first one covering its level. */
export function templateOf(ex: Pick<AdminExercise, 'game' | 'levelId' | 'templateId'>, templates: readonly AdminTemplate[]): AdminTemplate | null {
  const own = ex.templateId !== null ? templates.find((t) => t.id === ex.templateId && t.game === ex.game) : undefined;
  if (own) return own;
  return templates.find((t) => t.game === ex.game && t.status !== 'retired' && t.levelMin <= ex.levelId && t.levelMax >= ex.levelId) ?? null;
}

/**
 * Sample rounds of one exercise as a student of its level would get them at `step`: the generator on a pack of
 * this exercise alone, with every bol of the dictionary that is not retired (approved or not — a preview, nothing
 * is saved) and its template. One challenge per seed; a challenge the check refuses comes back as `dropped`.
 */
export function previewRounds(ex: AdminExercise, content: Pick<AdminContent, 'bols' | 'templates' | 'assets'>, step: number, labels: LabelRules = DEFAULT_LABEL_RULES): GeneratedRound[] {
  const template = templateOf(ex, content.templates);
  const pack: PlayPack = {
    version: 0,
    publishedAt: '',
    placeholders: true,
    bols: content.bols.filter((b) => b.status !== 'retired').map((b) => ({ ...b, placeholder: false })),
    assets: content.assets.filter((a) => a.status !== 'retired').map((a) => ({ ...a, placeholder: false })),
    templates: template ? [{ ...template, levelMin: ex.levelId, levelMax: ex.levelId }] : [],
    exercises: [{ ...ex, templateId: template?.id ?? null, placeholder: false, requiresItem: null }],
    labels,
  };
  return PREVIEW_SEEDS.map((seed) =>
    generateRound({ pack, levelId: ex.levelId, levelUpOk: false, ticked: [], game: ex.game, step, seed, mode: 'play', seen: [], now: 0, roundLen: 1 }),
  );
}

// ---------------------------------------------------------------- progress (§12.2, §10.1 Class progress)

/** Each skill's highest step at a level, from the approved templates (labels.ts needs it for Ready for Review). */
export function topSteps(templates: readonly (PlayTemplate & { status?: ContentStatus })[], levelId: number): Partial<Record<SkillId, number>> {
  const tops: Partial<Record<SkillId, number>> = {};
  for (const t of templates) {
    if ((t.status ?? 'approved') !== 'approved' || t.levelMin > levelId || t.levelMax < levelId) continue;
    tops[t.skill] = Math.max(tops[t.skill] ?? 0, topStep(t));
  }
  return tops;
}

export type ClassRow = { studentId: string; fullName: string; levelId: number; skills: SkillProgress[]; ready: boolean; lastPlayed: string | null };

/** The newest round's time, finished or started. */
function lastOf(rounds: readonly PlayedRound[]): string | null {
  let last: string | null = null;
  for (const r of rounds) {
    const at = r.finishedAt ?? r.startedAt;
    if (!last || at > last) last = at;
  }
  return last;
}

/**
 * Class progress: per student the skills' labels; students with a "Ready for Review" first, then the longest
 * without practice (never played first), then by name. Never a ranking by score (§10.1).
 */
export function classRows(
  students: readonly { studentId: string; fullName: string; levelId: number; rounds: readonly PlayedRound[] }[],
  templates: readonly (PlayTemplate & { status?: ContentStatus })[],
  rules: LabelRules,
  now: number,
): ClassRow[] {
  const rows = students.map((s) => {
    const skills = skillProgress(s.rounds, rules, topSteps(templates, s.levelId), now);
    return { studentId: s.studentId, fullName: s.fullName, levelId: s.levelId, skills, ready: skills.some((k) => k.label === 'ready_for_review'), lastPlayed: lastOf(s.rounds) };
  });
  return rows.sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      (a.lastPlayed ?? '').localeCompare(b.lastPlayed ?? '') ||
      a.fullName.localeCompare(b.fullName),
  );
}

/** Skills a facilitator rates 0-3 (performance: timing or judged, §12.1). */
export function ratedSkills(all: readonly SkillId[], kind: Readonly<Record<SkillId, string>>): SkillId[] {
  return all.filter((s) => kind[s] !== 'recognition');
}

/** A due day `weeks` weeks after `today` (YYYY-MM-DD), or null for none. */
export function dueAfter(today: string, weeks: number | null): string | null {
  if (!weeks) return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}
