// Rhythm Playground engine: the shared types (docs/RHYTHM_PLAYGROUND.md §8-§9; docs/DECISIONS.md #720-#729).
// Every game screen, the Playground home and the staff content screens build on these names. They are a
// published interface: the game packages (W2-W5) build against them in parallel, so a change here goes
// through the lead first.
//
// Database: supabase/migrations/0065_playground.sql. The pack (bols, sounds, templates, exercises) is the
// published content every student may see; the state is one student's level, ticks, settings,
// assignments and last 30 days of rounds. Rounds are made on the phone (seeded, offline) and checked
// again by the server when saved (record_round).

/** The 14 games (play_templates.game). */
export type GameId =
  | 'sound_detective'
  | 'tap_the_beat'
  | 'echo'
  | 'missing_beat'
  | 'voice_companion'
  | 'rhythm_builder'
  | 'kirtan_companion'
  | 'tempo_detective'
  | 'sound_explorer'
  | 'daily_quest'
  | 'tala_cycle'
  | 'rhythm_switching'
  | 'vocal_studio'
  | 'kirtan_sync';

export const GAME_IDS: readonly GameId[] = [
  'sound_detective', 'tap_the_beat', 'echo', 'missing_beat', 'voice_companion', 'rhythm_builder', 'kirtan_companion',
  'tempo_detective', 'sound_explorer', 'daily_quest', 'tala_cycle', 'rhythm_switching', 'vocal_studio', 'kirtan_sync',
];

/** The skills rounds, progress and the Daily Mission count (§8.2). */
export type SkillId =
  | 'listen.stroke'
  | 'listen.phrase'
  | 'listen.tempo'
  | 'listen.instrument'
  | 'listen.kirtan'
  | 'rhythm.pulse'
  | 'rhythm.matra'
  | 'rhythm.cycle_sam'
  | 'rhythm.guna'
  | 'rhythm.sequence'
  | 'rhythm.recall'
  | 'vocal.pitch'
  | 'vocal.steady'
  | 'vocal.bol_recite'
  | 'vocal.call_response'
  | 'kirtan.entry'
  | 'kirtan.keep'
  | 'kirtan.recover';

export const SKILL_IDS: readonly SkillId[] = [
  'listen.stroke', 'listen.phrase', 'listen.tempo', 'listen.instrument', 'listen.kirtan', 'rhythm.pulse', 'rhythm.matra',
  'rhythm.cycle_sam', 'rhythm.guna', 'rhythm.sequence', 'rhythm.recall', 'vocal.pitch', 'vocal.steady', 'vocal.bol_recite',
  'vocal.call_response', 'kirtan.entry', 'kirtan.keep', 'kirtan.recover',
];

/**
 * How a skill's evidence is read (§12.1), never added together: recognition = right answers with sample size;
 * timing = measured median error and spread, only on a calibrated phone; judged = only a facilitator's rating.
 */
export type SkillKind = 'recognition' | 'timing' | 'judged';

export const SKILL_KIND: Readonly<Record<SkillId, SkillKind>> = {
  'listen.stroke': 'recognition',
  'listen.phrase': 'recognition',
  'listen.tempo': 'recognition',
  'listen.instrument': 'recognition',
  'listen.kirtan': 'recognition',
  'rhythm.pulse': 'timing',
  'rhythm.matra': 'timing',
  'rhythm.cycle_sam': 'timing',
  'rhythm.guna': 'timing',
  'rhythm.sequence': 'recognition',
  'rhythm.recall': 'recognition',
  'vocal.pitch': 'judged',
  'vocal.steady': 'judged',
  'vocal.bol_recite': 'judged',
  'vocal.call_response': 'judged',
  'kirtan.entry': 'recognition',
  'kirtan.keep': 'timing',
  'kirtan.recover': 'judged',
};

export type ResponseMode = 'choose' | 'order' | 'tap' | 'count' | 'record' | 'self_check';
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'retired';
/** How a round was started: free play, a review round, the Daily Mission, Surprise me, an assignment. */
export type RoundMode = 'play' | 'review' | 'daily' | 'surprise' | 'assigned';
export type Device = 'android' | 'ios' | 'web';
export type Head = 'dayan' | 'baya' | 'both';

// ---------------------------------------------------------------- the pack (published content)

/** One approved bol of the dictionary (play_bols). `id` is the plain form (lib/bols.ts plainBol): 'dha'. */
export type PlayBol = {
  id: string;
  /** As the class writes it: 'dhā'. */
  written: string;
  head: Head;
  technique: string | null;
  open: boolean | null;
  /** First taught at this level. */
  levelId: number;
  /** Bols that sound the same as this one (one card for them). */
  soundsLike: string[];
  /** Approved "hard" distractors (close pairs, step 4 of Sound Detective). */
  closePairs: string[];
  /** Its recording, when there is one; otherwise the app's bundled or synthesised stroke. */
  assetId: number | null;
  placeholder: boolean;
};

export type AssetKind = 'stroke' | 'phrase' | 'tempo' | 'kirtan' | 'instrument' | 'voice' | 'tone';

/** One approved sound file (play_assets). `path` in the bucket playground-audio, or bundled in the app. */
export type PlayAsset = {
  id: number;
  kind: AssetKind;
  path: string | null;
  bundledKey: string | null;
  mime: 'audio/wav' | 'audio/mp4' | 'audio/mpeg' | null;
  durationMs: number | null;
  bpm: number | null;
  /** Kirtan clips: sam times, beats per cycle, entry points, tempo changes. */
  beatGrid: Record<string, unknown> | null;
  instruments: string[];
  licence: 'own' | 'permission' | 'cc_by' | 'public_domain';
  performer: string | null;
  credit: string | null;
  placeholder: boolean;
};

/**
 * One difficulty step of a template (play_templates.steps). Only `step` is required; the rest are read by the
 * games that use them. Unknown keys are kept for the game packages.
 */
export type TemplateStep = {
  step: number;
  /** Cards to choose from (answer included). */
  choices?: number;
  /** Beats in the prompt: [min, max]. Sound Detective: [1, 1] = a single bol. */
  len?: [number, number];
  /** The beat grid (sam X, khali 0) is shown. */
  grid?: boolean;
  /** Missing Beat: positions left silent. */
  gaps?: number;
  /** Sound Detective: distractors from the bol's approved close pairs. */
  closePairs?: boolean;
  /** Sound Detective step 1: distractors from the other head (dayan vs baya). */
  otherHead?: boolean;
  /** Rhythm Builder: extra tiles beside the right ones. */
  extraTiles?: number;
  /** Tempo Detective: the tempo difference as a share (0.25 = 25 %). */
  tempoDiff?: number;
  /** Tempo Detective: "the same" is one of the answers. */
  same?: boolean;
  [key: string]: unknown;
};

/** Template parameters (play_templates.params). */
export type TemplateParams = {
  /** Challenges in a round (4-8). */
  roundLen?: number;
  /** At most this share of a round is spaced review (default 1/3). */
  reviewShare?: number;
  /** Guna allowed per level id: {"1":[1,2]}. Missing = the exercise's own list. */
  gunaByLevel?: Record<string, number[]>;
  [key: string]: unknown;
};

/** The rule of a challenge type (play_templates). */
export type PlayTemplate = {
  id: number;
  game: GameId;
  skill: SkillId;
  responseMode: ResponseMode;
  levelMin: number;
  levelMax: number;
  steps: TemplateStep[];
  params: TemplateParams;
  revision: number;
};

/** The right answer of an exercise (play_exercises.answer); which keys are set depends on the game. */
export type ExerciseAnswer = {
  bols?: string[];
  order?: string[];
  tempo?: 'faster' | 'slower' | 'same';
  instruments?: string[];
};

/** One approved musical item of the exercise bank (play_exercises), in the taal notation of 0018. */
export type PlayExercise = {
  id: number;
  game: GameId;
  templateId: number | null;
  levelId: number;
  skills: SkillId[];
  taalId: number | null;
  /** Beats: '-' (rest) or 1-4 dictionary bol ids joined with '.', e.g. ['te.re', 'khe', 'ta']. */
  sequence: string[] | null;
  /** Vibhags, when the item is a cycle. */
  divisions: number[] | null;
  answer: ExerciseAnswer;
  /** Approved distractors for this item: bol ids, or whole phrases written as space-separated beats. */
  distractors: string[];
  promptAssets: number[];
  bpmMin: number | null;
  bpmMax: number | null;
  guna: number[];
  /** Only after the teacher has ticked this syllabus item. */
  requiresItem: number | null;
  locale: string;
  attribution: string | null;
  placeholder: boolean;
  revision: number;
};

/** The label thresholds (§12.2), from the setting playground_labels; Prji changes them after the pilot. */
export type LabelRules = {
  /** Recognition: items in `windowDays` for Practising. */
  practisingItems: number;
  /** Recognition Steady: share right of the last `steadyItems` items at the current step. */
  steadyShare: number;
  steadyItems: number;
  steadyDays: number;
  steadyMaxReplays: number;
  /** Timing: calibrated rounds for Practising and Steady; thresholds in ms. */
  timingRounds: number;
  timingMedianMs: number;
  timingSpreadMs: number;
  timingDays: number;
  windowDays: number;
};

/** Everything a student may play, as published (playground_pack). Cached on the phone (pack-cache.ts). */
export type PlayPack = {
  version: number;
  publishedAt: string;
  /** TEST only: placeholder content is shown, with the "TEST sounds" badge (§19.3). Always false on LIVE. */
  placeholders: boolean;
  bols: PlayBol[];
  assets: PlayAsset[];
  templates: PlayTemplate[];
  exercises: PlayExercise[];
  labels: LabelRules;
};

// ---------------------------------------------------------------- one student's state

/** A facilitator's step limits for one game: the override always wins (§8.8). */
export type StepLimits = { min?: number; max?: number };

export type PlaySettings = {
  surprise: boolean;
  relaxedTiming: boolean;
  /** May see one level above (§8.5 rule 2). */
  levelUpOk: boolean;
  steps: Partial<Record<GameId, StepLimits>>;
};

export const DEFAULT_PLAY_SETTINGS: PlaySettings = { surprise: true, relaxedTiming: false, levelUpOk: false, steps: {} };

/** A facilitator's assignment of a game (or one skill of it) to a level, a group or one student. */
export type PlayAssignment = {
  id: number;
  game: GameId;
  skill: SkillId | null;
  levelId: number | null;
  groupId: number | null;
  studentId: string | null;
  stepMin: number | null;
  stepMax: number | null;
  fromDay: string;
  dueDay: string | null;
  note: string | null;
};

/**
 * One answered challenge as saved in a round (play_rounds.items). Short keys keep a round row small (§13.4).
 * e exercise id · r its revision · q the question's parameters (gap positions, tempos, cards) · a the answer
 * given · ok right (recognition; the server recomputes it) · rp replays · ms time to answer · rv a spaced
 * review item · tr tries.
 */
export type RoundItem = {
  e: number;
  r: number;
  q?: ChallengeQuery;
  a?: string;
  ok?: boolean;
  rp?: number;
  ms?: number;
  rv?: boolean;
  tr?: number;
};

/** Timing of a performance round, only meaningful on a calibrated phone (§12.1, DYN-08). */
export type RoundTiming = { medianMs: number; spreadMs: number; calibrated: boolean; offsetMs?: number };

/** A finished (or left) round, as kept on the phone and saved by record_round. */
export type PlayedRound = {
  /** Made on the phone; the offline queue's request id (a second send saves nothing new). */
  id: string;
  game: GameId;
  skill: SkillId;
  mode: RoundMode;
  levelId: number | null;
  step: number;
  seed: number;
  contentVersion: number;
  startedAt: string;
  finishedAt: string | null;
  items: RoundItem[];
  timing: RoundTiming | null;
  device: Device | null;
};

/** One student's Playground state (my_playground_state; staff_playground_progress for a facilitator). */
export type StudentPlayState = {
  studentId: string;
  levelId: number;
  /** Syllabus items the teacher has ticked (student_progress). */
  ticked: number[];
  /** The student's groups (group_members), for assignments. */
  groups: number[];
  settings: PlaySettings;
  assignments: PlayAssignment[];
  /** Saved rounds of the last 30 days, newest first. */
  rounds: PlayedRound[];
};

// ---------------------------------------------------------------- a generated round

/** What is saved of a challenge so the server can check the answer again and QA can explain it. */
export type ChallengeQuery = {
  /** Missing Beat: the silent positions (0-based beats). */
  gap?: number[];
  /** Tempo Detective: the two tempos played. */
  bpm?: [number, number];
  /** The cards shown, as answer keys. */
  c?: string[];
  /** The tempo the prompt was played at. */
  t?: number;
  /** Guna. */
  g?: number;
};

/** A card: its answer key and what it sounds/shows (beats in the notation). */
export type Choice = { key: string; beats: string[] };

/** What the game sounds and shows for a challenge. */
export type Prompt = {
  beats: string[];
  bpm: number;
  guna: number;
  /** Beats left silent (Missing Beat). */
  gaps: number[];
  divisions: number[] | null;
  /** Recorded prompts (play_assets ids); empty = rendered from strokes. */
  assets: number[];
  /** Tempo Detective: the second example, the same beats at another tempo. */
  second: { bpm: number } | null;
  /** Show the beat grid (sam, khali marks). */
  grid: boolean;
};

export type Challenge = {
  exerciseId: number;
  revision: number;
  templateId: number | null;
  game: GameId;
  skill: SkillId;
  step: number;
  /** A spaced-review item, labelled "Review" so it is not taken for a repeat (§8.6). */
  review: boolean;
  prompt: Prompt;
  /** Cards (choose), tiles (order), empty for tap/record/self-check games. */
  choices: Choice[];
  /** The right answer's key: bols as space-separated beats ('te.re khe'), 'faster' / 'slower' / 'same', ... */
  answer: string;
  query: ChallengeQuery;
};

/** The round's recipe: with the same content version it rebuilds the same round (DYN-06, staff Preview). */
export type RoundRecipe = {
  seed: number;
  contentVersion: number;
  game: GameId;
  levelId: number;
  step: number;
  mode: RoundMode;
};

/** A challenge the check refused (§8.5): dropped, never shown; reported with no personal data. */
export type DroppedChallenge = { exerciseId: number; templateId: number | null; reason: CheckFailure };

export type CheckFailure =
  | 'answer_missing'
  | 'card_sounds_like_answer'
  | 'duplicate_card'
  | 'gap_on_rest'
  | 'tempo_out_of_range'
  | 'guna_not_allowed'
  | 'too_few_choices'
  | 'no_prompt';

export type GeneratedRound = {
  recipe: RoundRecipe;
  skill: SkillId;
  challenges: Challenge[];
  /** Too few eligible items: shown as "Review practice" and items may repeat (§8.7, DYN-07). */
  lowContent: boolean;
  /** Eligible items for this game and step (the pool the round was drawn from). */
  poolSize: number;
  dropped: DroppedChallenge[];
};

/** The words of §12.2. */
export type ProgressLabel = 'exploring' | 'practising' | 'steady' | 'ready_for_review';

/** One skill's progress for My Playground progress and the facilitator's Class progress. */
export type SkillProgress = {
  skill: SkillId;
  kind: SkillKind;
  label: ProgressLabel;
  /** Recognition: items answered in the window; timing: calibrated rounds. */
  opportunities: number;
  /** Recognition: right answers among them (null for timing). */
  correct: number | null;
  /** The step the label was judged at (the latest round's). */
  step: number | null;
  lastPractised: string | null;
  /** More / same / fewer right than two weeks before (recognition only). */
  trend: 'more' | 'same' | 'fewer' | null;
  /** Timing only: "calibrated" when the rounds were measured on a calibrated phone. */
  timingConfidence: 'calibrated' | 'not_calibrated' | null;
};

/** The adaptive rules' advice for the next round (§8.8, DYN-04). The student chooses; nothing moves by itself. */
export type StepAdvice = {
  /** The step to start at. */
  step: number;
  /** Offer a harder or easier step; null = stay. */
  offer: 'harder' | 'easier' | null;
  /** The step the offer leads to. */
  offerStep: number | null;
  /** Back after 14+ days: one step lower as a warm-up. */
  warmUp: boolean;
  /** Steps the student may pick by hand: 1 (or the facilitator's minimum) .. highest reached (or the maximum). */
  choosable: number[];
};
