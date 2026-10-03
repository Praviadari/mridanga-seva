// "Record myself" in the browser (the phone version is my-recordings.ts): the recordings are kept
// only while the page is open (blob: addresses in memory), never uploaded. The screen says so.

import type { MyRecording, RecordingSetting } from './my-recordings';
import type { RecordedTake } from './recording';

export type { MyRecording, RecordingSetting } from './my-recordings';

/** Most recordings kept. */
export const MAX_RECORDINGS = 30;

let kept: MyRecording[] = [];

/** The kept recordings, newest first. */
export async function listMyRecordings(): Promise<MyRecording[]> {
  return kept;
}

/** Keeps a take for as long as the page is open. */
export async function keepMyRecording(take: RecordedTake, setting: RecordingSetting | null): Promise<MyRecording> {
  const recording: MyRecording = { id: `${Date.now()}`, uri: take.uri, durationMs: take.durationMs, recordedAt: take.recordedAt, setting };
  kept = [recording, ...kept];
  for (const old of kept.slice(MAX_RECORDINGS)) URL.revokeObjectURL(old.uri);
  kept = kept.slice(0, MAX_RECORDINGS);
  return recording;
}

/** Forgets a recording. */
export async function deleteMyRecording(id: string): Promise<void> {
  const gone = kept.find((r) => r.id === id);
  if (gone) URL.revokeObjectURL(gone.uri);
  kept = kept.filter((r) => r.id !== id);
}
