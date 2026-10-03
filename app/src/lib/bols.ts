// The khol (mridanga) bols the practice tools know: which head, which zone of the head, which hand
// and fingers, and whether the stroke rings (open) or is damped (closed). Used by the taal player
// (S5) to pick a sound and by the two-head view (V1) to light the zone and the hand.
// Source: NOTES.md "Research: the instrument" → Bols (kksongs khol lessons 2-4). The khol, not the
// Carnatic mridangam: its bols and strokes differ and must not be mixed in.
//
// A taal's beat is written as '-' (rest) or 1-4 bols joined with '.', e.g. 'te.re' (two half-beats),
// as stored in the taals table (supabase/migrations/0016_practice.sql). Bols are matched without
// their long-vowel marks (tā = ta). The baya vowels are interchangeable (ka/ke/ki, gha/ghe/ghi).
// Unverified mappings are marked below; the Guru's taals may use other syllables, which the app
// shows and sounds as a plain stroke without a zone.

/** The small, high head (right hand) and the big bass head (left hand). */
export type Head = 'dayan' | 'baya';

/**
 * Where on the head the stroke lands, from the rim inwards: kinar (outer ring), maidan (middle
 * field), syahiEdge (the border of the black centre), syahi (the black centre). 'whole' = the
 * flat hand over the head (baya ka).
 */
export type Zone = 'kinar' | 'maidan' | 'syahiEdge' | 'syahi' | 'whole';

/** What touches the head. Shown in words next to the drawing. */
export type Touch = 'index' | 'middle' | 'threeFingers' | 'flatHand' | 'fingers' | 'wristFingers' | 'slide';

/** The sounds the player makes (synthesised in lib/practice-sounds.ts). */
export type SoundId = 'ta' | 'na' | 'ti' | 'ra' | 'te' | 'ka' | 'gha' | 'ga' | 'gin' | 'plain' | 'click' | 'accent';

/** One stroke of one hand. */
export type Stroke = {
  head: Head;
  zone: Zone;
  touch: Touch;
  /** Rings on (open) or damped at once (closed). */
  open: boolean;
  sound: SoundId;
  /** Started a little after the beat (the second stroke of jhā). Fraction of the bol's length. */
  delay?: number;
};

/** One bol as played: its written name and its strokes (two for the combined bols, none for a rest). */
export type Bol = {
  /** As written in the taal, e.g. 'dhā'. '-' for a rest. */
  text: string;
  strokes: Stroke[];
  /** Not a known khol bol: shown, sounded plain, no zone lit. */
  unknown: boolean;
};

const S = {
  ta: { head: 'dayan', zone: 'syahiEdge', touch: 'index', open: true, sound: 'ta' },
  na: { head: 'dayan', zone: 'kinar', touch: 'index', open: true, sound: 'na' },
  ti: { head: 'dayan', zone: 'syahi', touch: 'threeFingers', open: false, sound: 'ti' },
  ra: { head: 'dayan', zone: 'syahi', touch: 'index', open: false, sound: 'ra' },
  te: { head: 'dayan', zone: 'syahi', touch: 'middle', open: false, sound: 'te' },
  ka: { head: 'baya', zone: 'whole', touch: 'flatHand', open: false, sound: 'ka' },
  gha: { head: 'baya', zone: 'syahi', touch: 'fingers', open: true, sound: 'gha' },
  ga: { head: 'baya', zone: 'maidan', touch: 'wristFingers', open: true, sound: 'ga' },
  gin: { head: 'baya', zone: 'maidan', touch: 'slide', open: true, sound: 'gin' },
} satisfies Record<string, Stroke>;

/** Known bols (without long-vowel marks) and their strokes. */
const KNOWN: Record<string, Stroke[]> = {
  ta: [S.ta],
  na: [S.na],
  ti: [S.ti],
  tin: [S.ti], // unverified: written "tin" in some kirtan thekas; taken as tī
  ra: [S.ra],
  re: [S.ra],
  te: [S.te],
  ka: [S.ka],
  ke: [S.ka],
  ki: [S.ka],
  kha: [S.ka], // unverified: "khe" of the seed mantra Te-Re-Khe-Ta taken as the closed baya ka
  khe: [S.ka],
  gha: [S.gha],
  ghe: [S.gha],
  ghi: [S.gha],
  ga: [S.ga],
  ge: [S.ga], // unverified: ge/gi taken as ga
  gi: [S.ga],
  gin: [S.gin],
  jin: [S.gin],
  // Both hands: dhā = tā + ga · jhā = ga + tā (delayed) · dhin = tī + ga · kat = ka + tī.
  dha: [S.ta, S.ga],
  jha: [S.ga, { ...S.ta, delay: 0.18 }],
  dhin: [S.ti, S.ga],
  dhi: [S.ti, S.ga], // unverified: dhi taken as dhin
  kat: [S.ka, S.ti],
};

/** 'Tā' → 'ta': lower case, long-vowel and other accent marks taken off. */
export function plainBol(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** The strokes of one written bol. '-' = a rest. */
export function readBol(text: string): Bol {
  const plain = plainBol(text);
  if (plain === '-' || plain === '') return { text: '-', strokes: [], unknown: false };
  const strokes = KNOWN[plain];
  if (strokes) return { text, strokes, unknown: false };
  return {
    text,
    strokes: [{ head: 'dayan', zone: 'whole', touch: 'fingers', open: false, sound: 'plain' }],
    unknown: true,
  };
}

/** The bols of one beat: 'te.re' → [te, re]; '-' → [rest]. */
export function readBeat(beat: string): Bol[] {
  const trimmed = beat.trim();
  if (trimmed === '-' || trimmed === '') return [readBol('-')];
  return trimmed.split('.').map(readBol);
}

/** True when the bol is played with the left hand on the baya (a tali is an open baya stroke). */
export function hasOpenBaya(bol: Bol): boolean {
  return bol.strokes.some((s) => s.head === 'baya' && s.open);
}
