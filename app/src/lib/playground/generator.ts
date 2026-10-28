// The seeded round generator (docs/RHYTHM_PLAYGROUND.md §8.4, DYN-01, DYN-03, DYN-06; #725). It only selects and
// transforms approved items: it chooses an exercise (repeat-guard.ts), a gap position (Missing Beat), two tempos
// inside the exercise's range (Tempo Detective), the order of tiles (Rhythm Builder) and distractor cards from
// the exercise's own approved list or the approved bols of the level. It never joins two exercises into a new
// phrase and never writes a new sequence. Every challenge goes through the check (check.ts); a failing one is
// dropped and listed, never shown.
//
// The same recipe {seed, content version, game, level, step} and the same history give the same round on every
// device: everything random comes from rng.ts. The other games (tap, echo, cycles, voice, kirtan) get the
// approved sequence at an approved tempo and guna, with no cards; their packages add their own transforms.

import { checkChallenge, expectedAnswer } from './check';
import { allowedGuna, bolSounds, eligibleExercises, levelBols, templateFor, topLevel, type EligibilityContext } from './eligibility';
import { answerKey, beatBols, bolIndex, keyBeats, REST, sameSound, type BolIndex } from './notation';
import { pickExercises, type SeenItem } from './repeat-guard';
import { makeRng, type Rng } from './rng';
import type {
  Challenge,
  Choice,
  DroppedChallenge,
  GameId,
  GeneratedRound,
  PlayBol,
  PlayExercise,
  PlayPack,
  PlayTemplate,
  RoundMode,
  SkillId,
  TemplateStep,
} from './types';

/** Challenges in a round when the template does not say (§8.9: 4-8). */
export const DEFAULT_ROUND_LEN = 6;
export const MIN_ROUND_LEN = 4;
export const MAX_ROUND_LEN = 8;
/** Tempo when an exercise has no range. */
export const DEFAULT_BPM = 70;

export type GenerateInput = EligibilityContext & {
  game: GameId;
  step: number;
  seed: number;
  mode: RoundMode;
  /** The student's history (this phone + saved rounds), any order. */
  seen: readonly SeenItem[];
  /** Now, in ms (Date.now()); a fixed value in tests and replays. */
  now: number;
  /** Assigned skills come first (§8.5 rule 7). */
  assignedSkills?: readonly SkillId[];
  /** Override the template's round length (Daily Mission: 2-3). */
  roundLen?: number;
};

/** The template's step (the last one when asked for more), or a bare step. */
export function stepOf(template: PlayTemplate | null, step: number): TemplateStep {
  if (!template || template.steps.length === 0) return { step };
  const sorted = [...template.steps].sort((a, b) => a.step - b.step);
  return sorted.find((s) => s.step === step) ?? sorted.filter((s) => s.step <= step).pop() ?? sorted[0];
}

/** The highest step a template has. */
export function topStep(template: PlayTemplate | null): number {
  return template && template.steps.length > 0 ? Math.max(...template.steps.map((s) => s.step)) : 1;
}

export function roundLength(template: PlayTemplate | null, override?: number): number {
  const wanted = override ?? template?.params.roundLen ?? DEFAULT_ROUND_LEN;
  return override !== undefined ? Math.max(1, Math.min(MAX_ROUND_LEN, wanted)) : Math.max(MIN_ROUND_LEN, Math.min(MAX_ROUND_LEN, wanted));
}

/** A tempo inside the exercise's range, to 0.5 bpm. */
function chooseBpm(ex: PlayExercise, rng: Rng): number {
  const lo = ex.bpmMin ?? (ex.bpmMax !== null ? Math.min(ex.bpmMax, DEFAULT_BPM) : DEFAULT_BPM);
  const hi = ex.bpmMax ?? Math.max(lo, DEFAULT_BPM);
  return Math.round((lo + rng.next() * (hi - lo)) * 2) / 2;
}

/** Distractor bol ids for a single-bol answer, in preference order (shuffled within each kind). */
function bolDistractors(answer: string, ex: PlayExercise, step: TemplateStep, bols: readonly PlayBol[], index: BolIndex, rng: Rng): string[] {
  const own = ex.distractors.filter((d) => !d.includes(' ') && index.has(d));
  const bol = index.get(answer);
  const levelIds = bols.map((b) => b.id);
  const rest = rng.shuffle(levelIds);
  if (step.closePairs && bol) return [...rng.shuffle(bol.closePairs.filter((id) => levelIds.includes(id))), ...rng.shuffle(own), ...rest];
  if (step.otherHead && bol && bol.head !== 'both') {
    // Step 1: the other head only (dayan vs baya); the level's other bols only when it has none.
    const other = levelIds.filter((id) => index.get(id)?.head !== bol.head);
    return other.length > 0 ? rng.shuffle(other) : rest;
  }
  return [...rng.shuffle(own), ...rest];
}

/** Takes cards in order, skipping any that sound like the answer or like a card already taken. */
function takeCards(answer: string, candidates: readonly string[], count: number, index: BolIndex): string[] {
  const cards = [answer];
  for (const c of candidates) {
    if (cards.length >= count) break;
    if (cards.some((k) => sameSound(k, c, index))) continue;
    cards.push(c);
  }
  return cards;
}

const toChoice = (key: string): Choice => ({ key, beats: keyBeats(key) });

type Built = Omit<Challenge, 'review'>;

function soundDetective(ex: PlayExercise, step: TemplateStep, base: Built, ctx: GenCtx): Built {
  const answer = expectedAnswer('sound_detective', ex, undefined) ?? '';
  const beats = keyBeats(answer);
  const count = Math.max(2, step.choices ?? 3);
  let candidates: string[];
  if (beats.length === 1 && beatBols(beats[0]).length === 1) {
    candidates = bolDistractors(beats[0], ex, step, ctx.bols, ctx.index, ctx.rng);
  } else {
    // A phrase: the exercise's own approved alternatives, then other eligible phrases of the same length.
    const own = ex.distractors.filter((d) => keyBeats(d).length === beats.length);
    const others = ctx.pool
      .filter((o) => o.id !== ex.id)
      .map((o) => expectedAnswer('sound_detective', o, undefined) ?? '')
      .filter((k) => keyBeats(k).length === beats.length);
    candidates = [...ctx.rng.shuffle(own), ...ctx.rng.shuffle(others)];
  }
  const cards = ctx.rng.shuffle(takeCards(answer, candidates, count, ctx.index));
  return { ...base, prompt: { ...base.prompt, beats }, choices: cards.map(toChoice), answer, query: { ...base.query, c: cards } };
}

function missingBeat(ex: PlayExercise, step: TemplateStep, base: Built, ctx: GenCtx): Built {
  const seq = ex.sequence ?? [];
  const playable = seq.map((b, i) => (b === REST ? -1 : i)).filter((i) => i >= 0);
  const gapCount = Math.max(1, Math.min(step.gaps ?? 1, playable.length));
  const gaps = ctx.rng.shuffle(playable).slice(0, gapCount).sort((a, b) => a - b);
  const query = { ...base.query, gap: gaps };
  const answer = expectedAnswer('missing_beat', ex, query) ?? '';
  const parts = keyBeats(answer);
  const count = Math.max(2, step.choices ?? 3);
  // Cards are single beats: the gaps' beats, then distractors (own list, then the level's bols) that sound
  // like none of them.
  const cards: string[] = [];
  for (const p of parts) if (!cards.includes(p)) cards.push(p);
  const candidates = [
    ...ctx.rng.shuffle(ex.distractors.filter((d) => !d.includes(' '))),
    ...ctx.rng.shuffle(ctx.bols.map((b) => b.id)),
  ];
  for (const c of candidates) {
    if (cards.length >= Math.max(count, parts.length + 1)) break;
    if (cards.some((k) => sameSound(k, c, ctx.index))) continue;
    cards.push(c);
  }
  const shown = ctx.rng.shuffle(cards);
  return {
    ...base,
    prompt: { ...base.prompt, beats: seq, gaps },
    choices: shown.map(toChoice),
    answer,
    query: { ...query, c: shown },
  };
}

function rhythmBuilder(ex: PlayExercise, step: TemplateStep, base: Built, ctx: GenCtx): Built {
  const answer = expectedAnswer('rhythm_builder', ex, undefined) ?? '';
  const beats = keyBeats(answer);
  const tiles = beats.filter((b) => b !== REST);
  const extras: string[] = [];
  const candidates = [
    ...ctx.rng.shuffle(ex.distractors.filter((d) => !d.includes(' '))),
    ...ctx.rng.shuffle(ctx.bols.map((b) => b.id)),
  ];
  for (const c of candidates) {
    if (extras.length >= (step.extraTiles ?? 0)) break;
    if ([...tiles, ...extras].some((k) => sameSound(k, c, ctx.index))) continue;
    extras.push(c);
  }
  // Each tile its own card: the same beat twice is two tiles with the same key (the screen tells them apart by place).
  const all = ctx.rng.shuffle([...tiles, ...extras]);
  return {
    ...base,
    prompt: { ...base.prompt, beats },
    choices: all.map((key) => toChoice(key)),
    answer,
    query: { ...base.query, c: all },
  };
}

function tempoDetective(ex: PlayExercise, step: TemplateStep, base: Built, ctx: GenCtx): Built {
  const lo = ex.bpmMin ?? 40;
  const hi = ex.bpmMax ?? 160;
  const diff = step.tempoDiff ?? 0.25;
  const kinds: ('faster' | 'slower' | 'same')[] = step.same === false ? ['faster', 'slower'] : ['faster', 'slower', 'same'];
  const kind = ctx.rng.pick(kinds) ?? 'faster';
  const round = (n: number) => Math.round(n * 2) / 2;
  let a: number;
  let b: number;
  if (kind === 'same') {
    a = round(lo + ctx.rng.next() * (hi - lo));
    b = a;
  } else if (kind === 'faster') {
    // Both inside the range: b rounded down (never above hi); a too narrow range leaves b outside → dropped.
    const top = hi / (1 + diff);
    a = round(lo + ctx.rng.next() * Math.max(0, top - lo));
    b = Math.floor(a * (1 + diff) * 2) / 2;
  } else {
    const bottom = lo / (1 - diff);
    a = round(bottom + ctx.rng.next() * Math.max(0, hi - bottom));
    b = Math.ceil(a * (1 - diff) * 2) / 2;
  }
  const query = { ...base.query, bpm: [a, b] as [number, number], t: a, c: kinds };
  return {
    ...base,
    prompt: { ...base.prompt, beats: ex.sequence ?? [], bpm: a, second: { bpm: b } },
    choices: kinds.map((k) => ({ key: k, beats: [] })),
    answer: expectedAnswer('tempo_detective', ex, query) ?? '',
    query,
  };
}

function soundExplorer(ex: PlayExercise, step: TemplateStep, base: Built, ctx: GenCtx): Built {
  const answer = expectedAnswer('sound_explorer', ex, undefined) ?? '';
  const instruments = new Set<string>();
  for (const a of ctx.pack.assets) for (const i of a.instruments) instruments.add(i);
  const right = keyBeats(answer);
  const others = ctx.rng.shuffle([...instruments].filter((i) => !right.includes(i)).sort());
  const cards = ctx.rng.shuffle([...right, ...others.slice(0, Math.max(0, (step.choices ?? 3) - right.length))]);
  return { ...base, choices: cards.map((k) => ({ key: k, beats: [] })), answer, query: { ...base.query, c: cards } };
}

/** The other games: the approved sequence at an approved tempo and guna; no cards. */
function plain(ex: PlayExercise, base: Built): Built {
  const beats = ex.sequence ?? [];
  return { ...base, prompt: { ...base.prompt, beats }, answer: answerKey(beats) };
}

type GenCtx = { pack: PlayPack; bols: PlayBol[]; index: BolIndex; rng: Rng; pool: PlayExercise[] };

/** Builds one challenge for an exercise (not yet checked). */
export function buildChallenge(ex: PlayExercise, template: PlayTemplate | null, step: number, levelId: number, ctx: GenCtx): Built {
  const s = stepOf(template, step);
  const guna = ctx.rng.pick(allowedGuna(ex, template, levelId)) ?? 1;
  const bpm = chooseBpm(ex, ctx.rng);
  const base: Built = {
    exerciseId: ex.id,
    revision: ex.revision,
    templateId: template?.id ?? ex.templateId,
    game: ex.game,
    skill: template?.skill ?? ex.skills[0],
    step,
    prompt: {
      beats: [],
      bpm,
      guna,
      gaps: [],
      divisions: ex.divisions,
      assets: ex.promptAssets,
      second: null,
      grid: s.grid ?? true,
    },
    choices: [],
    answer: '',
    query: { t: bpm, g: guna },
  };
  switch (ex.game) {
    case 'sound_detective':
      return soundDetective(ex, s, base, ctx);
    case 'missing_beat':
      return missingBeat(ex, s, base, ctx);
    case 'rhythm_builder':
      return rhythmBuilder(ex, s, base, ctx);
    case 'tempo_detective':
      return tempoDetective(ex, s, base, ctx);
    case 'sound_explorer':
      return soundExplorer(ex, s, base, ctx);
    default:
      return plain(ex, base);
  }
}

/**
 * Makes a round. Deterministic: the same input (recipe, pack version, history, now) gives the same round. The
 * challenges are in the order to play; `dropped` lists those the check refused (to report, §8.5).
 */
export function generateRound(input: GenerateInput): GeneratedRound {
  const { pack, game, levelId, step, seed, mode } = input;
  const rng = makeRng(seed);
  const template = templateFor(pack, game, levelId);
  const skill: SkillId = template?.skill ?? 'listen.stroke';
  const recipe = { seed, contentVersion: pack.version, game, levelId, step, mode };
  const pool = eligibleExercises(input, game);
  const roundLen = roundLength(template, input.roundLen);
  if (!template || pool.length === 0) {
    return { recipe, skill, challenges: [], lowContent: true, poolSize: pool.length, dropped: [] };
  }
  const preferred = input.assignedSkills?.length
    ? pool.filter((ex) => ex.skills.some((s) => input.assignedSkills?.includes(s))).map((ex) => ex.id)
    : undefined;
  const { picks, lowContent } = pickExercises({
    pool: pool.map((ex) => ex.id),
    game,
    roundLen,
    seen: input.seen,
    now: input.now,
    rng,
    reviewShare: template.params.reviewShare,
    preferred,
  });
  const index = bolIndex(pack.bols);
  const ready = input.soundReady ?? (() => true);
  const bols = levelBols(pack, topLevel(input)).filter((b) => bolSounds(b, pack, ready));
  const ctx: GenCtx = { pack, bols, index, rng, pool };
  const challenges: Challenge[] = [];
  const dropped: DroppedChallenge[] = [];
  for (const p of picks) {
    const ex = pool.find((e) => e.id === p.exerciseId);
    if (!ex) continue;
    const built = buildChallenge(ex, template, step, levelId, ctx);
    const challenge: Challenge = { ...built, review: p.review };
    const failure = checkChallenge(challenge, ex, template, levelId, index);
    if (failure) dropped.push({ exerciseId: ex.id, templateId: challenge.templateId, reason: failure });
    else challenges.push(challenge);
  }
  return { recipe, skill, challenges, lowContent, poolSize: pool.length, dropped };
}
