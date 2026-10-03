// "Record myself" on S5 (Phase 2 slice 4, docs/DECISIONS.md #52): the recordings stay on the phone,
// never uploaded. Each is an .m4a in the app's own document folder (recordings/), listed in
// recordings/index.json with what was playing when it was made, so "Play with the sound" can start
// the same metronome or taal beside it. At most MAX_RECORDINGS: the oldest goes when a new one comes.
// The browser version is my-recordings.web.ts (kept only while the page is open).

import { Directory, File, Paths } from 'expo-file-system';

import type { RecordedTake } from './recording';

/** Most recordings kept on the phone. */
export const MAX_RECORDINGS = 30;

/** What was playing while recording, to play it again beside the recording. */
export type RecordingSetting =
  | { mode: 'metronome'; bpm: number; beatsPerBar: number }
  | { mode: 'taal'; taalId: number; taalName: string; taalBpm: number; speed: number };

/** One kept recording. */
export type MyRecording = {
  id: string;
  uri: string;
  durationMs: number;
  recordedAt: string;
  /** null = recorded without the metronome or taal. */
  setting: RecordingSetting | null;
};

type Stored = Omit<MyRecording, 'uri'> & { fileName: string };

const folder = () => new Directory(Paths.document, 'recordings');
const indexFile = () => new File(folder(), 'index.json');

function readIndex(): Stored[] {
  try {
    const file = indexFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(file.textSync()) as unknown;
    return Array.isArray(parsed) ? (parsed as Stored[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: Stored[]): void {
  const file = indexFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(list));
}

function toRecording(s: Stored): MyRecording {
  return { id: s.id, uri: new File(folder(), s.fileName).uri, durationMs: s.durationMs, recordedAt: s.recordedAt, setting: s.setting };
}

/** The kept recordings, newest first. */
export async function listMyRecordings(): Promise<MyRecording[]> {
  return readIndex()
    .filter((s) => new File(folder(), s.fileName).exists)
    .map(toRecording);
}

/** Keeps a take: moves its file out of the cache into the app's own folder. */
export async function keepMyRecording(take: RecordedTake, setting: RecordingSetting | null): Promise<MyRecording> {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const id = `${Date.now()}`;
  const fileName = `${id}.${take.ending}`;
  await new File(take.uri).move(new File(dir, fileName));
  const stored: Stored = { id, fileName, durationMs: take.durationMs, recordedAt: take.recordedAt, setting };
  const list = [stored, ...readIndex()];
  for (const old of list.slice(MAX_RECORDINGS)) {
    const file = new File(dir, old.fileName);
    if (file.exists) file.delete();
  }
  writeIndex(list.slice(0, MAX_RECORDINGS));
  return toRecording(stored);
}

/** Deletes a kept recording and its file. */
export async function deleteMyRecording(id: string): Promise<void> {
  const list = readIndex();
  const gone = list.find((s) => s.id === id);
  if (gone) {
    const file = new File(folder(), gone.fileName);
    if (file.exists) file.delete();
  }
  writeIndex(list.filter((s) => s.id !== id));
}
