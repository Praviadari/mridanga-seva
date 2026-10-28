// How a Playground round was opened (docs/DECISIONS.md #754): from the Daily Sādhana Quest or Surprise me the game's
// address carries `?mode=daily|surprise&len=N`, and the round is saved with that mode and holds N challenges; opened
// from the Playground home it is free play with the template's length.

import { useLocalSearchParams } from 'expo-router';

import type { RoundMode } from '@/lib/playground/types';

/** The round's mode and length from the address. */
export function useRoundParams(): { mode: RoundMode; len: number | undefined } {
  const params = useLocalSearchParams<{ mode?: string; len?: string }>();
  const mode: RoundMode = params.mode === 'daily' || params.mode === 'surprise' ? params.mode : 'play';
  const n = Number(params.len);
  return { mode, len: mode !== 'play' && Number.isInteger(n) && n >= 1 && n <= 8 ? n : undefined };
}