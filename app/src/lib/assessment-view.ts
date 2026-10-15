// How a student's assessment (S7) and the review screen (C14) show recordings (docs/DECISIONS.md #383): the
// newest reviewed recording, whose mark comes first; a recording's number counted from the first one sent; and
// the kind a file is shown as, so a recording made with the app's own recorder reads as audio.

import type { MediaFile, MediaKind } from '@/data/assessment-files';

/** The newest recording with a review, in a list that is newest first (as fetchAssignment gives it); null when none. */
export function newestReviewed<T extends { reviewedAt: string | null }>(submissions: T[]): T | null {
  return submissions.find((s) => s.reviewedAt !== null) ?? null;
}

/** A recording's number, the first one sent being 1, from its place in a list of `count` that is newest first. */
export function recordingNumber(index: number, count: number): number {
  return count - index;
}

/**
 * The kind a file is shown as. A recording made with the app's own recorder is sound only, but a browser saves
 * it as .webm, which the bucket counts as 'video' by its ending (migration 0016, and the database checks the kind
 * against the ending, so it is stored as 'video'). Those files carry the app's own names: recording.fileName
 * ("recording") for a student's recording, recording.voiceNoteName ("voice note") for a coordinator's voice note.
 */
export function shownKind(file: Pick<MediaFile, 'name' | 'kind'>): MediaKind {
  return file.kind === 'video' && /^(recording|voice note)\.webm$/i.test(file.name.trim()) ? 'audio' : file.kind;
}
