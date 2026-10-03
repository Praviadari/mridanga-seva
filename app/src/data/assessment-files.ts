// Files on assessments (Phase 2): the Guru's photos, PDFs, audio and video on an assessment (G6)
// and the students' recordings (S7), in the private Storage bucket assessment-files (migration
// 0016_assessments.sql, docs/DECISIONS.md #52). Picking photos and PDFs is the announcement form's
// (./announcement-files.ts); this file adds audio and video, and uploads into the other bucket.
//
// A file is uploaded only when the form is saved, never when it is picked. The type sent to
// Storage comes from the file's ending, so it is always one the bucket accepts. A student may pick
// a file made with the phone's own recorder or camera, or record in the app (slice 4: expo-audio,
// lib/recording.ts, next planned APK); recordingAsMedia turns such a take into a file to upload.

import type { ParseKeys } from 'i18next';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { pickPdfs, pickPhotos, type PickResult as PhotoPickResult } from './announcement-files';
import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** The private Storage bucket (migration 0016). */
export const ASSESSMENT_BUCKET = 'assessment-files';
/** At most this many files on one assessment (the database checks the same). */
export const MAX_MEDIA = 3;
/** Largest file the bucket accepts: 50 MB (docs/DECISIONS.md #52). */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
/** How long a signed link works, in seconds. Screens load new links each time they open. */
const LINK_SECONDS = 60 * 60;

/** What a file is. Recordings are 'audio' or 'video'. */
export type MediaKind = 'image' | 'pdf' | 'audio' | 'video';

/** One saved file: an entry of assessments.media or assessment_submissions.file. */
export type MediaFile = { path: string; name: string; kind: MediaKind; size: number };

/** A file picked on this device and not uploaded yet. */
export type PickedMedia = {
  key: string;
  name: string;
  kind: MediaKind;
  size: number;
  uri: string;
  /** The ending used in Storage, e.g. 'm4a'. */
  ending: string;
  /** The type sent to Storage, e.g. 'audio/mp4'. */
  mimeType: string;
  webFile?: Blob;
};

/** The endings the bucket takes, with their kind and type (the same list as migration 0016). */
const ENDINGS: Record<string, { kind: MediaKind; mime: string }> = {
  jpg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  webp: { kind: 'image', mime: 'image/webp' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  amr: { kind: 'audio', mime: 'audio/amr' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  '3gp': { kind: 'video', mime: 'video/3gpp' },
  webm: { kind: 'video', mime: 'video/webm' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
};

/** Endings phones and browsers give that mean the same as one in ENDINGS. */
const SAME_AS: Record<string, string> = { jpeg: 'jpg', opus: 'ogg', oga: 'ogg', qt: 'mov', '3gpp': '3gp' };

/** Endings by type, for a file whose name has no ending (common on Android). */
const BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg',
  'audio/opus': 'ogg', 'audio/amr': 'amr', 'audio/3gpp': '3gp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'video/3gpp': '3gp', 'video/webm': 'webm', 'audio/webm': 'webm', 'video/x-matroska': 'mkv',
};

/** The bucket's ending for a picked file, from its name or else its type; null when not taken. */
export function endingFor(name: string | null | undefined, mimeType: string | null | undefined): string | null {
  const fromName = (name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const normal = fromName ? (SAME_AS[fromName] ?? fromName) : undefined;
  if (normal && ENDINGS[normal]) return normal;
  const fromMime = mimeType ? BY_MIME[mimeType.toLowerCase().split(';')[0]] : undefined;
  return fromMime ?? null;
}

/** Reads a saved file entry from the database; null when it is not well formed. */
export function parseMediaFile(value: unknown): MediaFile | null {
  if (!value || typeof value !== 'object') return null;
  const { path, name, kind, size } = value as Record<string, unknown>;
  if (typeof path !== 'string' || typeof name !== 'string') return null;
  if (kind !== 'image' && kind !== 'pdf' && kind !== 'audio' && kind !== 'video') return null;
  return { path, name, kind, size: typeof size === 'number' ? size : 0 };
}

/** Reads assessments.media, keeping only well-formed entries. */
export function parseMedia(value: unknown): MediaFile[] {
  return Array.isArray(value) ? value.flatMap((item) => parseMediaFile(item) ?? []) : [];
}

/** Picked photos or PDFs (from the announcement pickers) as assessment files. */
function fromPhotoPick(result: PhotoPickResult): { files: PickedMedia[]; errorKey?: MessageKey } {
  return {
    errorKey: result.errorKey,
    files: result.files.map((f) => ({
      key: f.key,
      name: f.name,
      kind: f.kind,
      size: f.size,
      uri: f.uri,
      ending: f.kind === 'pdf' ? 'pdf' : 'jpg',
      mimeType: f.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
      webFile: f.webFile,
    })),
  };
}

/** Result of a pick: the files, and a message when some could not be taken. */
export type MediaPickResult = { files: PickedMedia[]; errorKey?: MessageKey };

/** Photos for an assessment (made smaller, as on announcements). */
export async function pickMediaPhotos(room: number): Promise<MediaPickResult> {
  return fromPhotoPick(await pickPhotos(room));
}

/** PDFs for an assessment (at most 5 MB, as on announcements). */
export async function pickMediaPdfs(room: number): Promise<MediaPickResult> {
  return fromPhotoPick(await pickPdfs(room));
}

/** The size in bytes of a picked file. */
async function sizeOf(uri: string, given: number | null | undefined, webFile?: Blob): Promise<number> {
  if (typeof given === 'number' && given > 0) return given;
  if (webFile) return webFile.size;
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  return new File(uri).size;
}

/** Turns one picked asset into a file to upload, or a message why it cannot be taken. */
async function takeRecording(asset: {
  uri: string;
  name: string | null | undefined;
  mimeType: string | null | undefined;
  size: number | null | undefined;
  webFile?: Blob;
}): Promise<PickedMedia | MessageKey> {
  const ending = endingFor(asset.name, asset.mimeType);
  const kind = ending ? ENDINGS[ending]?.kind : undefined;
  if (!ending || (kind !== 'audio' && kind !== 'video')) return 'assessments.files.notRecording';
  const size = await sizeOf(asset.uri, asset.size, asset.webFile);
  if (size > MAX_MEDIA_BYTES) return 'assessments.files.tooBig';
  const base = (asset.name ?? '').replace(/\.[^.]*$/, '').trim() || (kind === 'audio' ? 'recording' : 'video');
  return {
    key: Crypto.randomUUID(),
    name: `${base}.${ending}`.slice(-120),
    kind,
    size,
    uri: asset.uri,
    ending,
    mimeType: ENDINGS[ending].mime,
    webFile: asset.webFile,
  };
}

/**
 * Opens the file chooser for audio and video files (a recording made with the phone's own
 * recorder or camera, a WhatsApp voice note saved to the phone ...). Returns up to `room`.
 */
export async function pickRecordingFiles(room: number): Promise<MediaPickResult> {
  if (room <= 0) return { files: [], errorKey: 'assessments.files.tooMany' };
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'video/*'],
      multiple: room > 1,
      copyToCacheDirectory: true,
      base64: false,
    });
    if (result.canceled) return { files: [] };
    const files: PickedMedia[] = [];
    let errorKey: MessageKey | undefined = result.assets.length > room ? 'assessments.files.someLeftOut' : undefined;
    for (const asset of result.assets.slice(0, room)) {
      const taken = await takeRecording({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, webFile: asset.file });
      if (typeof taken === 'string') errorKey = taken;
      else files.push(taken);
    }
    return { files, errorKey };
  } catch {
    return { files: [], errorKey: 'assessments.files.pickFailed' };
  }
}

/**
 * A recording made in the app (lib/recording.ts) as a file to upload: S7 sends it as the student's
 * recording, C14 as the coordinator's voice note (Phase 2 slice 4). A browser's .webm counts as
 * 'video' by its ending, as in the bucket's list.
 */
export async function recordingAsMedia(
  take: { uri: string; ending: string; mimeType: string; size: number; webFile?: Blob },
  baseName: string,
): Promise<PickedMedia | MessageKey> {
  return takeRecording({ uri: take.uri, name: `${baseName}.${take.ending}`, mimeType: take.mimeType, size: take.size, webFile: take.webFile });
}

/** Opens the phone's gallery for one video (iPhones keep camera videos there, not in Files). */
export async function pickGalleryVideo(): Promise<MediaPickResult> {
  try {
    if (Platform.OS === 'ios') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return { files: [], errorKey: 'announcements.files.noPhotoAccess' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false });
    if (result.canceled || !result.assets[0]) return { files: [] };
    const asset = result.assets[0];
    const taken = await takeRecording({
      uri: asset.uri,
      name: asset.fileName ?? 'video.mp4',
      mimeType: asset.mimeType ?? 'video/mp4',
      size: asset.fileSize,
      webFile: asset.file,
    });
    return typeof taken === 'string' ? { files: [], errorKey: taken } : { files: [taken] };
  } catch {
    return { files: [], errorKey: 'assessments.files.pickFailed' };
  }
}

/** The bytes to upload: the browser's file on the web, the file's contents on a phone. */
async function bodyOf(file: PickedMedia): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') return file.webFile ?? (await (await fetch(file.uri)).blob());
  return new File(file.uri).arrayBuffer();
}

/** Turns a Storage error message into a translation key. */
function storageErrorKey(message: string): MessageKey {
  if (/maximum allowed size|too large|payload/i.test(message)) return 'assessments.files.tooBig';
  if (/mime type|not supported/i.test(message)) return 'assessments.files.notRecording';
  if (/row-level security|unauthorized|not allowed/i.test(message)) return 'assessments.files.uploadRefused';
  if (isNetworkError(message)) return 'common.networkError';
  return 'announcements.files.uploadFailed';
}

/**
 * Uploads picked files into the signed-in person's folder (`myId`), in order. If one fails, the
 * ones already uploaded are removed again and only the message comes back.
 */
export async function uploadMedia(myId: string, files: PickedMedia[]): Promise<{ media?: MediaFile[]; errorKey?: MessageKey }> {
  const uploaded: MediaFile[] = [];
  for (const file of files) {
    const path = `${myId}/${Crypto.randomUUID().toLowerCase()}.${file.ending}`;
    try {
      const { error } = await supabase.storage
        .from(ASSESSMENT_BUCKET)
        .upload(path, await bodyOf(file), { contentType: file.mimeType, upsert: false });
      if (error) {
        await removeMedia(uploaded.map((m) => m.path));
        return { errorKey: storageErrorKey(error.message) };
      }
    } catch (failure) {
      await removeMedia(uploaded.map((m) => m.path));
      return { errorKey: storageErrorKey(String(failure)) };
    }
    uploaded.push({ path, name: file.name, kind: file.kind, size: file.size });
  }
  return { media: uploaded };
}

/** Removes files from Storage (own uploads not sent yet; the Guru any). False when it failed. */
export async function removeMedia(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    const { error } = await supabase.storage.from(ASSESSMENT_BUCKET).remove(paths);
    return !error;
  } catch {
    return false;
  }
}

/** Signed links that work for an hour, by path; files that failed are missing from the map. */
export async function mediaLinks(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  try {
    const { data, error } = await supabase.storage.from(ASSESSMENT_BUCKET).createSignedUrls(paths, LINK_SECONDS);
    if (error || !data) return new Map();
    return new Map(
      data.flatMap((link) => (link.path && link.signedUrl && !link.error ? [[link.path, link.signedUrl] as const] : [])),
    );
  } catch {
    return new Map();
  }
}
