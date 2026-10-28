// The Rhythm Playground home's games and the student's progress words (docs/RHYTHM_PLAYGROUND.md §6.1, §12.4;
// docs/DECISIONS.md #730, #735). The games are listed in their groups — Listening, Rhythm, Voice, Kīrtan — with
// Surprise me and My Playground progress; a game not built yet has no address and is shown dimmed "Coming soon", not
// tappable. One address per game: Sound Detective, Tap the Beat and Echo Challenge keep the addresses "Which bol?",
// the tap pad and Echo me had, so old links and What's new entries still open them. The Daily Sādhana Quest is the
// Daily Mission card, not a tile here.

import { SKILL_IDS, type GameId, type ProgressLabel, type SkillId, type SkillProgress } from '../playground/types';

export type PlayGroup = 'listening' | 'rhythm' | 'voice' | 'kirtan';

/** The student addresses of the games built so far. */
export type GameRoute =
  | '/student/which-bol'
  | '/student/playground/missing-beat'
  | '/student/playground/tempo-detective'
  | '/student/playground/rhythm-builder'
  | '/student/tap-pad'
  | '/student/echo-me';

/** A game on the home: its icon (components/icon.tsx) and its address, or null while it is coming. */
export type GameTile = { game: GameId; icon: 'listen' | 'search' | 'time' | 'instruments' | 'tap' | 'loop' | 'taal' | 'refresh' | 'level' | 'record' | 'performer' | 'drum' | 'events'; route: GameRoute | null };

/** The groups in the order of §6.1. */
export const PLAYGROUND_GROUPS: readonly { group: PlayGroup; games: readonly GameTile[] }[] = [
  {
    group: 'listening',
    games: [
      { game: 'sound_detective', icon: 'listen', route: '/student/which-bol' },
      { game: 'missing_beat', icon: 'search', route: '/student/playground/missing-beat' },
      { game: 'tempo_detective', icon: 'time', route: '/student/playground/tempo-detective' },
      { game: 'sound_explorer', icon: 'instruments', route: null },
    ],
  },
  {
    group: 'rhythm',
    games: [
      { game: 'tap_the_beat', icon: 'tap', route: '/student/tap-pad' },
      { game: 'echo', icon: 'loop', route: '/student/echo-me' },
      { game: 'rhythm_builder', icon: 'taal', route: '/student/playground/rhythm-builder' },
      { game: 'tala_cycle', icon: 'refresh', route: null },
      { game: 'rhythm_switching', icon: 'level', route: null },
    ],
  },
  {
    group: 'voice',
    games: [
      { game: 'voice_companion', icon: 'record', route: null },
      { game: 'vocal_studio', icon: 'performer', route: null },
    ],
  },
  {
    group: 'kirtan',
    games: [
      { game: 'kirtan_companion', icon: 'drum', route: null },
      { game: 'kirtan_sync', icon: 'events', route: null },
    ],
  },
];

/** The games on the home, in order. */
export function allTiles(): GameTile[] {
  return PLAYGROUND_GROUPS.flatMap((g) => [...g.games]);
}

/** The labels in their order (§12.2): words, never a score or a rank. */
export const PLAY_LABELS: readonly ProgressLabel[] = ['exploring', 'practising', 'steady', 'ready_for_review'];

/** The translation key of each skill's name. */
const SKILL_KEYS = {
  'listen.stroke': 'playground.skill.listen_stroke',
  'listen.phrase': 'playground.skill.listen_phrase',
  'listen.tempo': 'playground.skill.listen_tempo',
  'listen.instrument': 'playground.skill.listen_instrument',
  'listen.kirtan': 'playground.skill.listen_kirtan',
  'rhythm.pulse': 'playground.skill.rhythm_pulse',
  'rhythm.matra': 'playground.skill.rhythm_matra',
  'rhythm.cycle_sam': 'playground.skill.rhythm_cycle_sam',
  'rhythm.guna': 'playground.skill.rhythm_guna',
  'rhythm.sequence': 'playground.skill.rhythm_sequence',
  'rhythm.recall': 'playground.skill.rhythm_recall',
  'vocal.pitch': 'playground.skill.vocal_pitch',
  'vocal.steady': 'playground.skill.vocal_steady',
  'vocal.bol_recite': 'playground.skill.vocal_bol_recite',
  'vocal.call_response': 'playground.skill.vocal_call_response',
  'kirtan.entry': 'playground.skill.kirtan_entry',
  'kirtan.keep': 'playground.skill.kirtan_keep',
  'kirtan.recover': 'playground.skill.kirtan_recover',
} as const satisfies Record<SkillId, string>;

/** The translation key of a skill's name ('listen.stroke' → 'playground.skill.listen_stroke'); null for one unknown here. */
export function skillKey(skill: string): (typeof SKILL_KEYS)[SkillId] | null {
  return (SKILL_IDS as readonly string[]).includes(skill) ? SKILL_KEYS[skill as SkillId] : null;
}

/** The translation key of a label's word, and its icon (the word always shows; the icon never alone). */
export function labelView(label: ProgressLabel): { key: `playground.label.${ProgressLabel}`; icon: 'info' | 'practice' | 'tick' | 'assessment' } {
  const icon = label === 'exploring' ? 'info' : label === 'practising' ? 'practice' : label === 'steady' ? 'tick' : 'assessment';
  return { key: `playground.label.${label}` as const, icon };
}

/**
 * My Playground progress's two blocks, kept apart (§12.1): recognition (answers in games) and performance (timing on
 * a tuned phone, or a facilitator's rating), each in skill order; skills or labels unknown to this app are left out.
 */
export function progressBlocks(rows: readonly SkillProgress[]): { recognition: SkillProgress[]; performance: SkillProgress[] } {
  const known = rows.filter((r) => skillKey(r.skill) !== null && PLAY_LABELS.includes(r.label));
  const order = (a: SkillProgress, b: SkillProgress) => SKILL_IDS.indexOf(a.skill) - SKILL_IDS.indexOf(b.skill);
  return {
    recognition: known.filter((r) => r.kind === 'recognition').sort(order),
    performance: known.filter((r) => r.kind !== 'recognition').sort(order),
  };
}

/** The game whose round counts for a skill, for "Practise this" from the progress screen (built games only). */
export function gameForSkill(skill: SkillId): GameTile | null {
  const game: GameId | null =
    skill === 'listen.stroke' || skill === 'listen.phrase'
      ? 'sound_detective'
      : skill === 'listen.tempo'
        ? 'tempo_detective'
        : skill === 'rhythm.sequence'
          ? 'rhythm_builder'
          : null;
  return allTiles().find((t) => t.game === game && t.route) ?? null;
}
