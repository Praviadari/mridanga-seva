// "Send to my facilitator" from a Playground game (docs/RHYTHM_PLAYGROUND.md §10.4, §13.2, §13.4; docs/DECISIONS.md
// #766, #696): a game's take goes through the existing assessment path — the facilitator has released an assessment
// marked with that game (assessments.playground_game), the student records in the game, listens, may record again
// or delete, and only "Send" keeps the take on the phone and opens the assessment's send screen with it attached
// (as Record myself does). Takes are at most 90 seconds; a student has at most 2 game takes waiting for review at a
// time (0069 refuses a third; the button explains instead). Nothing is uploaded before the send screen's Send.

import { router } from 'expo-router';

import { keepMyRecording } from '@/lib/my-recordings';
import type { RecordedTake } from '@/lib/recording';
import { supabase } from '@/lib/supabase';
import type { GameId } from '@/lib/playground/types';

/** Longest take from a game (§13.4: ≤ 90 s ≈ 1 MB). */
export const PLAY_TAKE_MAX_SECONDS = 90;
/** Game takes waiting for review at one time (§13.4). */
export const PLAY_OPEN_TAKES_MAX = 2;

/** An open assessment the student may send this game's take to. */
export type PlayTakeTarget = { assignmentId: number; title: string; dueOn: string | null };

/** Where a take could go: this game's open assessments, and how many game takes wait for review. */
export type PlaySendInfo = { targets: PlayTakeTarget[]; waiting: number };

/** The student's Playground assessments; null when they could not be read (offline). */
export async function fetchPlaySendInfo(game: GameId): Promise<PlaySendInfo | null> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, status, assessments!inner(title, playground_game), assessment_releases(due_on)')
    .not('assessments.playground_game', 'is', null);
  if (error || !data) return null;
  type Row = {
    id: number;
    status: string;
    assessments: { title: string; playground_game: string | null } | null;
    assessment_releases: { due_on: string } | null;
  };
  return playSendInfo(data as unknown as Row[], game);
}

/** Pure part of fetchPlaySendInfo (tested): open = assigned, seen or redo; waiting = submitted, not yet reviewed. */
export function playSendInfo(
  rows: readonly { id: number; status: string; assessments: { title: string; playground_game: string | null } | null; assessment_releases: { due_on: string } | null }[],
  game: GameId,
): PlaySendInfo {
  const targets = rows
    .filter((r) => r.assessments?.playground_game === game && ['assigned', 'seen', 'redo'].includes(r.status))
    .map((r) => ({ assignmentId: r.id, title: r.assessments?.title ?? '', dueOn: r.assessment_releases?.due_on ?? null }));
  return { targets, waiting: rows.filter((r) => r.assessments?.playground_game && r.status === 'submitted').length };
}

/** Keeps the take on the phone (as Record myself) and opens the send screen with it attached. */
export async function openSendScreen(take: RecordedTake, assignmentId: number): Promise<boolean> {
  try {
    const kept = await keepMyRecording(take, null);
    router.push({ pathname: '/student/assessments/[id]', params: { id: String(assignmentId), take: kept.id } });
    return true;
  } catch {
    return false;
  }
}
