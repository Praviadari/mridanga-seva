// Photos and PDFs on announcements (C15 compose and edit, C15 and S10 detail): picking them on this
// phone or computer, making photos smaller, uploading them to the private Storage bucket, signed
// links to show them, and removing them.
//
// A file is uploaded only when the announcement is posted or saved, never when it is picked, so a
// form that is left without saving leaves nothing behind in Storage. Storage and the database
// check everything again: size, type, who may upload, open and delete (migration
// 0010_announcement_files.sql, docs/DECISIONS.md #32).

import type { ParseKeys } from 'i18next';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** The private Storage bucket (migration 0010). */
export const FILES_BUCKET = 'announcement-files';
/** At most this many files on one announcement (the database checks the same). */
export const MAX_FILES = 3;
/** Largest file Storage accepts, in bytes: 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Photos are made smaller to this many pixels on their longest side: sharp on any phone screen. */
const PHOTO_LONGEST_SIDE = 1600;
/** JPEG quality, 0 to 1: about 200-400 KB for a phone photo at 1600 pixels. */
const PHOTO_QUALITY = 0.7;
/** How long a signed link to a file works, in seconds. Screens load new links each time they open. */
const LINK_SECONDS = 60 * 60;

/** 'image' for photos (JPEG, PNG, WebP), 'pdf' for PDF documents. */
export type AttachmentKind = 'image' | 'pdf';

/** One file saved with an announcement: one entry of announcements.attachments. */
export type Attachment = {
  /** Where it is in the bucket: '<uploader's login id>/<random id>.<jpg|pdf>'. */
  path: string;
  /** Shown to readers, e.g. "Route map.jpg". */
  name: string;
  kind: AttachmentKind;
  /** Bytes. */
  size: number;
};

/** A file picked on this device and not uploaded yet. */
export type PickedFile = {
  /** Tells the files of one form apart. */
  key: string;
  name: string;
  kind: AttachmentKind;
  /** Bytes, after a photo was made smaller. */
  size: number;
  /** Where the device keeps it: a file:// address on phones, a blob: address in a browser. */
  uri: string;
  mimeType: string;
  /** The browser's own file object (web only), uploaded as it is. */
  webFile?: Blob;
};

/** A file of the compose or edit form: already saved with the announcement, or just picked. */
export type FormFile = (Attachment & { key: string }) | PickedFile;

/** True for a file picked on this device that still has to be uploaded. */
export function isPicked(file: FormFile): file is PickedFile {
  return !('path' in file);
}

/** The saved files as form files (for the edit form). */
export function formFilesOf(attachments: Attachment[]): FormFile[] {
  return attachments.map((attachment) => ({ ...attachment, key: attachment.path }));
}

/**
 * Reads announcements.attachments as it comes from the database, keeping only well-formed
 * entries, so a hand-edited row in the dashboard cannot break a screen.
 */
export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { path, name, kind, size } = item as Record<string, unknown>;
    if (typeof path !== 'string' || typeof name !== 'string' || (kind !== 'image' && kind !== 'pdf')) return [];
    return [{ path, name, kind, size: typeof size === 'number' ? size : 0 }];
  });
}

// ---------------------------------------------------------------- picking

/** Files picked, and a message when some could not be taken (too big, not a PDF ...). */
export type PickResult = { files: PickedFile[]; errorKey?: MessageKey };

/** `name` with its ending replaced by `.jpg`, or a plain name when there is none. */
function jpegName(name: string | null | undefined, index: number): string {
  const base = (name ?? '').replace(/\.[^.]*$/, '').trim();
  return `${base || `photo-${index + 1}`}.jpg`;
}

/** The size in bytes of a file the device holds. */
async function sizeOf(uri: string, webFile?: Blob): Promise<number> {
  if (webFile) return webFile.size;
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  return new File(uri).size;
}

/**
 * Makes a photo smaller and saves it as a JPEG: at most PHOTO_LONGEST_SIDE pixels on its longest
 * side (smaller photos keep their size). Saving it again also leaves out the hidden details a
 * camera adds, such as where the photo was taken. Returns the new file's address.
 */
async function shrinkPhoto(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (width > 0 && height > 0 && Math.max(width, height) > PHOTO_LONGEST_SIDE) {
    context.resize(width >= height ? { width: PHOTO_LONGEST_SIDE } : { height: PHOTO_LONGEST_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}

/**
 * Opens the photo library and returns up to `room` photos, each made smaller. Nothing is uploaded.
 * An empty list without a message means the person cancelled.
 */
export async function pickPhotos(room: number): Promise<PickResult> {
  if (room <= 0) return { files: [], errorKey: 'announcements.files.tooMany' };
  try {
    // Android's photo picker needs no permission; iPhones ask once.
    if (Platform.OS === 'ios') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return { files: [], errorKey: 'announcements.files.noPhotoAccess' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      quality: 1,
    });
    if (result.canceled) return { files: [] };
    const files: PickedFile[] = [];
    for (const [index, asset] of result.assets.slice(0, room).entries()) {
      const uri = await shrinkPhoto(asset.uri, asset.width, asset.height);
      const size = await sizeOf(uri);
      if (size > MAX_FILE_BYTES) return { files, errorKey: 'announcements.files.tooBig' };
      files.push({ key: Crypto.randomUUID(), name: jpegName(asset.fileName, index), kind: 'image', size, uri, mimeType: 'image/jpeg' });
    }
    const errorKey: MessageKey | undefined =
      result.assets.length > room ? 'announcements.files.someLeftOut' : undefined;
    return { files, errorKey };
  } catch {
    return { files: [], errorKey: 'announcements.files.pickFailed' };
  }
}

/**
 * Opens the file chooser for PDFs and returns up to `room` of them, each at most 5 MB. Nothing is
 * uploaded. An empty list without a message means the person cancelled.
 */
export async function pickPdfs(room: number): Promise<PickResult> {
  if (room <= 0) return { files: [], errorKey: 'announcements.files.tooMany' };
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: room > 1,
      copyToCacheDirectory: true,
      // Web: give a file address instead of the whole file as text.
      base64: false,
    });
    if (result.canceled) return { files: [] };
    const files: PickedFile[] = [];
    let errorKey: MessageKey | undefined = result.assets.length > room ? 'announcements.files.someLeftOut' : undefined;
    for (const asset of result.assets.slice(0, room)) {
      const isPdf = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        errorKey = 'announcements.files.notPdf';
        continue;
      }
      const size = asset.size ?? (await sizeOf(asset.uri, asset.file));
      if (size > MAX_FILE_BYTES) {
        errorKey = 'announcements.files.tooBig';
        continue;
      }
      files.push({
        key: Crypto.randomUUID(),
        name: asset.name,
        kind: 'pdf',
        size,
        uri: asset.uri,
        mimeType: 'application/pdf',
        webFile: asset.file,
      });
    }
    return { files, errorKey };
  } catch {
    return { files: [], errorKey: 'announcements.files.pickFailed' };
  }
}

// ---------------------------------------------------------------- uploading and removing

/** The bytes to upload: the browser's file on the web, the file's contents on a phone. */
async function bodyOf(file: PickedFile): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') return file.webFile ?? (await (await fetch(file.uri)).blob());
  return new File(file.uri).arrayBuffer();
}

/**
 * Uploads picked files into the signed-in person's folder (`myId` = their profile id), in order.
 * Returns them as announcement attachments. If one fails, the ones already uploaded are removed
 * again and nothing is returned but the message.
 */
export async function uploadFiles(
  myId: string,
  files: PickedFile[],
): Promise<{ attachments?: Attachment[]; errorKey?: MessageKey }> {
  const uploaded: Attachment[] = [];
  for (const file of files) {
    const path = `${myId}/${Crypto.randomUUID().toLowerCase()}.${file.kind === 'pdf' ? 'pdf' : 'jpg'}`;
    try {
      const { error } = await supabase.storage
        .from(FILES_BUCKET)
        .upload(path, await bodyOf(file), { contentType: file.mimeType, upsert: false });
      if (error) {
        await removeFiles(uploaded.map((a) => a.path));
        return { errorKey: storageErrorKey(error.message) };
      }
    } catch (failure) {
      await removeFiles(uploaded.map((a) => a.path));
      return { errorKey: storageErrorKey(String(failure)) };
    }
    uploaded.push({ path, name: file.name, kind: file.kind, size: file.size });
  }
  return { attachments: uploaded };
}

/**
 * Removes files from Storage (a database delete alone would leave the file there). Storage
 * allows it for the uploader, the Guru, and the author of the announcement that lists the file.
 * Returns false when it could not be done (usually no internet). A file already gone is fine.
 */
export async function removeFiles(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    const { error } = await supabase.storage.from(FILES_BUCKET).remove(paths);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Signed links for the given files, by path: each works for an hour for anyone who has it, so it
 * is made only for the person on the screen (Storage checks they may read the announcement).
 * Files that failed are missing from the map.
 */
export async function signedLinks(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  try {
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, LINK_SECONDS);
    if (error || !data) return new Map();
    return new Map(
      data.flatMap((link) => (link.path && link.signedUrl && !link.error ? [[link.path, link.signedUrl] as const] : [])),
    );
  } catch {
    return new Map();
  }
}

/** Turns a Storage error message into a translation key. */
function storageErrorKey(message: string): MessageKey {
  if (/maximum allowed size|too large|payload/i.test(message)) return 'announcements.files.tooBig';
  if (/mime type|not supported/i.test(message)) return 'announcements.files.wrongType';
  if (/row-level security|unauthorized|not allowed/i.test(message)) return 'announcements.errors.notAllowed';
  if (isNetworkError(message)) return 'common.networkError';
  return 'announcements.files.uploadFailed';
}
