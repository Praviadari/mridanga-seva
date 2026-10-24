// Which hand, and which part of it, plays a stroke (docs/DECISIONS.md #404): for the hand drawings under the two-head
// view (components/hand-view.tsx) and the L / R row of the beat grid. Read from lib/bols.ts only; nothing about a
// stroke is decided here.

import { readBeat, type Bol, type Touch } from './bols';

/** A part of the hand, as drawn. */
export type HandPart = 'thumb' | 'index' | 'middle' | 'ring' | 'little' | 'palm' | 'heel';

/** The parts of the hand that touch the head for each kind of touch. */
export function touchParts(touch: Touch): HandPart[] {
  switch (touch) {
    case 'index':
      return ['index'];
    case 'middle':
      return ['middle'];
    case 'threeFingers':
      return ['index', 'middle', 'ring'];
    case 'fingers':
      return ['index', 'middle', 'ring', 'little'];
    case 'wristFingers':
      return ['heel', 'index', 'middle', 'ring', 'little'];
    case 'flatHand':
    case 'slide':
    default:
      return ['palm', 'heel', 'thumb', 'index', 'middle', 'ring', 'little'];
  }
}

/** Who plays a bol: left hand (baya), right hand (dayan), both, or unknown ('?', a bol the app does not know). */
export type BolHands = 'left' | 'right' | 'both' | 'unknown';

/** Who plays one bol (not a rest). */
export function bolHands(bol: Bol): BolHands {
  if (bol.unknown) return 'unknown';
  const left = bol.strokes.some((s) => s.head === 'baya');
  const right = bol.strokes.some((s) => s.head === 'dayan');
  return left && right ? 'both' : left ? 'left' : 'right';
}

/** The hands of each bol of one beat as written in a taal ('te.re' → two); a rest gives none. */
export function beatHands(beat: string): BolHands[] {
  return readBeat(beat)
    .filter((bol) => bol.text !== '-')
    .map(bolHands);
}
