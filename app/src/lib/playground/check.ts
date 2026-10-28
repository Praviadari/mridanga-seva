// The challenge check and the answer check (docs/RHYTHM_PLAYGROUND.md §8.5, §9.3; #723).
//
// Before a challenge is shown: the right answer is among the cards, no other card sounds like it, no two cards
// are the same, a silent gap is never a rest, both tempos are inside the exercise's range and the guna is
// allowed. A failing challenge is dropped, not shown (generator.ts), and reported without personal data.
//
// When an answer is given: right when it sounds the same as the expected answer (notation.ts sameSound). The
// expected answer comes from the exercise and the saved question only (expectedAnswer), exactly as the server's
// record_round recomputes it (0065 play_expected), so a changed "ok" on the phone does not count.

import { allowedGuna, tempoInRange } from './eligibility';
import { answerKey, keyBeats, REST, sameSound, type BolIndex } from './notation';
import type { Challenge, ChallengeQuery, CheckFailure, GameId, PlayExercise, PlayTemplate } from './types';

/** Games whose answers are bols compared by sound. */
const BOL_ANSWER_GAMES: readonly GameId[] = ['sound_detective', 'missing_beat', 'rhythm_builder', 'echo'];

/** Games whose items the server re-marks (recognition); the others keep the phone's "ok" (timing, self-check). */
export const RECHECKED_GAMES: readonly GameId[] = ['sound_detective', 'missing_beat', 'rhythm_builder', 'tempo_detective', 'sound_explorer'];

/** The right answer of an exercise for a saved question, or null when it cannot be told (not re-marked). */
export function expectedAnswer(game: GameId, ex: Pick<PlayExercise, 'sequence' | 'answer'>, q: ChallengeQuery | undefined): string | null {
  const seq = ex.sequence ?? [];
  switch (game) {
    case 'sound_detective':
      return ex.answer.bols && ex.answer.bols.length > 0 ? answerKey(ex.answer.bols) : seq.length > 0 ? answerKey(seq) : null;
    case 'missing_beat': {
      const gaps = q?.gap ?? [];
      if (gaps.length === 0 || gaps.some((g) => !Number.isInteger(g) || g < 0 || g >= seq.length)) return null;
      return answerKey([...gaps].sort((a, b) => a - b).map((g) => seq[g]));
    }
    case 'rhythm_builder':
      return ex.answer.order && ex.answer.order.length > 0 ? answerKey(ex.answer.order) : seq.length > 0 ? answerKey(seq) : null;
    case 'tempo_detective': {
      const bpm = q?.bpm;
      if (!bpm || bpm.length !== 2) return null;
      const [a, b] = bpm;
      return b > a ? 'faster' : b < a ? 'slower' : 'same';
    }
    case 'sound_explorer':
      return ex.answer.instruments ? [...ex.answer.instruments].sort().join(' ') : null;
    default:
      return null;
  }
}

/** Is the given answer right? Bols by sound; instruments as a set; anything else must be equal. */
export function isRight(game: GameId, expected: string, given: string, index: BolIndex): boolean {
  if (BOL_ANSWER_GAMES.includes(game)) return sameSound(expected, given, index);
  if (game === 'sound_explorer') return expected === keyBeats(given).sort().join(' ');
  return expected === given;
}

/** The check of a challenge before it is shown; null = fine. */
export function checkChallenge(
  ch: Challenge,
  ex: PlayExercise,
  template: PlayTemplate | null,
  levelId: number,
  index: BolIndex,
): CheckFailure | null {
  const { prompt } = ch;
  if (prompt.beats.length === 0 && prompt.assets.length === 0) return 'no_prompt';
  if (!tempoInRange(ex, prompt.bpm) || (prompt.second && !tempoInRange(ex, prompt.second.bpm))) return 'tempo_out_of_range';
  if (!allowedGuna(ex, template, levelId).includes(prompt.guna)) return 'guna_not_allowed';
  if (prompt.gaps.some((g) => prompt.beats[g] === undefined || prompt.beats[g] === REST)) return 'gap_on_rest';
  if (ch.choices.length === 0) return null;
  const keys = ch.choices.map((c) => c.key);
  const bolGame = BOL_ANSWER_GAMES.includes(ch.game);
  if (ch.game === 'rhythm_builder') {
    // Tiles (the same beat may be on two): every beat of the answer is on a tile; an extra tile never sounds
    // like a needed one.
    const needed = keyBeats(ch.answer).filter((b) => b !== REST);
    const tiles = [...keys];
    for (const beat of needed) {
      const at = tiles.findIndex((t) => t === beat);
      if (at < 0) return 'answer_missing';
      tiles.splice(at, 1);
    }
    if (tiles.some((extra) => needed.some((beat) => sameSound(extra, beat, index)))) return 'card_sounds_like_answer';
    return null;
  }
  if (new Set(keys).size !== keys.length) return 'duplicate_card';
  if (ch.choices.length < 2) return 'too_few_choices';
  // Missing Beat with two gaps: the answer is one card per gap.
  const parts = ch.game === 'missing_beat' ? keyBeats(ch.answer) : [ch.answer];
  for (const part of parts) if (!keys.includes(part)) return 'answer_missing';
  for (const key of keys) {
    if (parts.includes(key)) continue;
    if (parts.some((part) => (bolGame ? sameSound(key, part, index) : key === part))) return 'card_sounds_like_answer';
  }
  if (bolGame) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) if (sameSound(keys[i], keys[j], index)) return 'duplicate_card';
    }
  }
  return null;
}
